import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { randomInt, randomUUID } from "node:crypto";
import { DemoBrevo } from "@/lib/demo";
import { BrevoError } from "@/lib/errors";
import { PortalService } from "@/lib/service";
import { NeonStore } from "@/lib/store";
import type { ReviewSnapshot } from "@/lib/types";

// Opt in using the isolated preview database. Never call real Brevo or Sheets here.
describe.skipIf(process.env.PORTAL_LIVE_DATABASE_TESTS !== "true")("live Neon approval safeguards", () => {
  let store: NeonStore, other: NeonStore, sql: NeonQueryFunction<false, false>;
  let id: number, scope: string, actor: string, client: string, snapshot: ReviewSnapshot;
  beforeEach(() => {
    sql = neon(process.env.DATABASE_URL!);
    store = new NeonStore(); other = new NeonStore();
    id = -randomInt(1, 2 ** 31); scope = `portal-test:${randomUUID()}`;
    actor = `${scope}:owner`; client = `${scope}:client`;
    snapshot = { listId: id, campaign: { id, subject: "Controlled database test", htmlContent: "<p>Sample</p>", status: "draft", type: "classic", recipients: { listIds: [id] } }, recipients: [{ id: 1, name: "Sample recipient", email: "sample@example.com", subscribed: true }] };
  });
  afterEach(async () => {
    await sql.transaction([
      sql`DELETE FROM portal_delivery_attempts WHERE campaign_id = ${id}`,
      sql`DELETE FROM portal_approvals WHERE campaign_id = ${id}`,
      sql`DELETE FROM portal_operations WHERE actor IN (${actor}, ${client})`,
      sql`DELETE FROM portal_locks WHERE scope IN (${scope}, ${`list:${id}`})`,
      sql`DELETE FROM portal_recipient_selections WHERE campaign_id = ${id}`
    ]);
  }, 15_000);
  const approval = () => ({ campaignId: id, listId: id, approvedBy: actor, fingerprint: "a".repeat(64), snapshot, outcome: "submitting" as const });

  it("allows one concurrent selection update and shares saved choices across instances", async () => {
    const results = await Promise.allSettled([store.setSelection(id, id, 1, false, 0), other.setSelection(id, id, 2, false, 0)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    const saved = await other.selection(id, id);
    expect(saved.revision).toBe(1); expect(saved.excludedIds).toHaveLength(1);
    await other.setSelection(id, id, saved.excludedIds[0], true, 1);
    expect(await store.selection(id, id)).toMatchObject({ excludedIds: [], revision: 2 });
    await expect(store.setSelection(id, id, 2, false, 1)).rejects.toMatchObject({ status: 409 });
  }, 30_000);

  it("separates newsletter-list scopes and retains exclusion ownership without changing choices", async () => {
    await store.setSelection(id, id, 1, false, 0); await store.setExclusionList(id, id, 54321);
    expect(await other.selection(id, id)).toEqual({ excludedIds: [1], revision: 1, exclusionListId: 54321 });
    expect(await other.selection(id, 999)).toEqual({ excludedIds: [], revision: 0, exclusionListId: null });
    await expect(store.setExclusionList(id, id, 54322)).rejects.toMatchObject({ status: 409 });
  }, 30_000);

  it("grants one concurrent lock and refuses release by a different token", async () => {
    const results = await Promise.allSettled([store.lock(scope, "one"), other.lock(scope, "two")]);
    const winners = results.filter(r => r.status === "fulfilled");
    expect(winners).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    const token = (winners[0] as PromiseFulfilledResult<string>).value;
    await other.unlock(scope, randomUUID());
    await expect(other.lock(scope, "retry")).rejects.toMatchObject({ status: 409 });
    await store.unlock(scope, token);
    const next = await other.lock(scope, "next");
    await other.unlock(scope, next);
  }, 30_000);

  it("persists reviewed content and blocks another approval after an unknown result", async () => {
    await store.begin(approval());
    await store.outcome(id, "unknown", "Simulated timeout");
    expect(await other.approval(id)).toMatchObject({ approvedBy: actor, outcome: "unknown", snapshot });
    await expect(other.begin({ ...approval(), approvedBy: client })).rejects.toMatchObject({ status: 409 });
    const attempts = await sql`SELECT outcome, snapshot FROM portal_delivery_attempts WHERE campaign_id = ${id}`;
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ outcome: "unknown", snapshot });
  }, 30_000);

  it("preserves a rejected approval when a new review is approved", async () => {
    await store.begin(approval()); await store.outcome(id, "rejected", "Simulated definite rejection");
    const revised = structuredClone(snapshot); revised.campaign.subject = "Revised controlled test";
    await other.begin({ ...approval(), approvedBy: client, snapshot: revised, fingerprint: "b".repeat(64) });
    const attempts = await sql`SELECT approved_by, outcome, snapshot FROM portal_delivery_attempts WHERE campaign_id = ${id} ORDER BY approved_at`;
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({ approved_by: actor, outcome: "rejected", snapshot });
    expect(attempts[1]).toMatchObject({ approved_by: client, outcome: "submitting", snapshot: revised });
  }, 30_000);

  it("updates the current attempt and retries Sheet synchronization after status changes", async () => {
    await store.begin(approval()); await store.synced(id);
    expect((await other.approval(id))?.sheetSynced).toBe(true);
    await store.outcome(id, "submitted");
    expect(await other.approval(id)).toMatchObject({ outcome: "submitted", sheetSynced: false });
    await store.outcome(id, "sent");
    const attempts = await sql`SELECT outcome FROM portal_delivery_attempts WHERE campaign_id = ${id}`;
    expect(attempts).toEqual([{ outcome: "sent" }]);
  }, 30_000);

  function services() {
    const brevo = new DemoBrevo();
    brevo.campaigns[0] = structuredClone(snapshot.campaign);
    brevo.people.forEach(person => { person.listIds = [id]; });
    const sheets = { issues: async () => [{ campaignId: id, date: "2026-10-04", subject: snapshot.campaign.subject }], sync: async () => {} };
    const delivery = { listId: id, enabled: true, reason: null };
    return { brevo, first: new PortalService(brevo, sheets, store, delivery), second: new PortalService(brevo, sheets, other, delivery) };
  }
  it("blocks simultaneous send and recipient requests from independent server instances", async () => {
    const { brevo, first, second } = services();
    const detail = await first.issue(id);
    let finish!: () => void, entered!: () => void;
    const entering = new Promise<void>(resolve => { entered = resolve; });
    vi.spyOn(brevo, "send").mockImplementation(async () => { entered(); await new Promise<void>(resolve => { finish = resolve; }); });
    const sending = first.send(actor, id, detail.fingerprint);
    await entering;
    try {
      await Promise.all([
        expect(second.send(client, id, detail.fingerprint)).rejects.toMatchObject({ status: 409 }),
        expect(second.remove(client, 1)).rejects.toMatchObject({ status: 409 })
      ]);
    } finally { finish(); await sending; }
    expect((await other.approval(id))?.outcome).toBe("submitted");
  }, 30_000);

  it("keeps uncertain delivery blocked across independent server instances", async () => {
    const { brevo, first, second } = services();
    const detail = await first.issue(id);
    const sending = vi.spyOn(brevo, "send").mockRejectedValue(new BrevoError(0, false, "Simulated timeout"));
    await expect(first.send(actor, id, detail.fingerprint)).rejects.toThrow("unknown");
    expect(await second.issue(id)).toMatchObject({ status: "unknown", canSend: false });
    await expect(second.send(client, id, detail.fingerprint)).rejects.toThrow("already exists");
    expect(sending).toHaveBeenCalledTimes(1);
  }, 30_000);
});
