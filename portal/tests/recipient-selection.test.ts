import { beforeEach, describe, expect, it, vi } from "vitest";
import { DemoBrevo, DemoSheets, MemoryStore } from "@/lib/demo";
import { PortalService } from "@/lib/service";
import { BrevoError } from "@/lib/errors";

describe("per-issue receiver choices", () => {
  let brevo: DemoBrevo, store: MemoryStore, service: PortalService;
  beforeEach(() => {
    brevo = new DemoBrevo(); store = new MemoryStore();
    service = new PortalService(brevo, new DemoSheets(), store, { listId: 999, enabled: true, reason: null });
  });
  async function choose(contactId: number, included: boolean) {
    const current = await service.issueRecipients(101);
    await service.chooseRecipient("owner", 101, contactId, included, current.revision);
  }
  it("initially selects subscribed people only and saves choices across server instances", async () => {
    expect((await service.issueRecipients(101)).recipients.map(p => p.included)).toEqual([true, true, false]);
    await choose(1, false);
    const other = new PortalService(brevo, new DemoSheets(), store, { listId: 999, enabled: true, reason: null });
    expect(await other.issue(101)).toMatchObject({ eligibleCount: 1 });
    expect((await other.issueRecipients(101)).recipients[0].included).toBe(false);
    expect((await brevo.contact(1))?.listIds).toEqual([999]);
    brevo.campaigns[1].status = "draft";
    expect((await other.issueRecipients(100)).recipients.map(p => p.included)).toEqual([true, true, false]);
  });
  it("rejects stale tabs instead of overwriting another person's choices", async () => {
    await choose(1, false);
    await expect(service.chooseRecipient("client", 101, 2, false, 0)).rejects.toThrow("another tab");
    expect((await service.issueRecipients(101)).recipients[1].included).toBe(true);
  });
  it("rejects stale delivery reviews, even after a choice is changed back", async () => {
    const review = await service.issue(101), send = vi.spyOn(brevo, "send");
    await choose(1, false); await choose(1, true);
    await expect(service.send("owner", 101, review.fingerprint)).rejects.toThrow("changed");
    expect(send).not.toHaveBeenCalled();
  });
  it("keeps unsubscribe choices and excluded recipients' address corrections intact", async () => {
    await expect(choose(3, true)).rejects.toThrow("Unsubscribed");
    await choose(1, false); await service.update("owner", 1, "Alex", "corrected@example.com");
    expect((await service.issueRecipients(101)).recipients[0]).toMatchObject({ email: "corrected@example.com", included: false });
    expect((await brevo.contact(3))?.emailBlacklisted).toBe(true);
  });
  it("refuses choices outside this project's history, mailing list or targeting", async () => {
    await expect(service.chooseRecipient("owner", 200, 1, false, 0)).rejects.toThrow("history");
    brevo.people.push({ id: 4, email: "outside@example.com", listIds: [123] });
    await expect(choose(4, true)).rejects.toThrow("does not belong");
    brevo.campaigns[0].recipients = { listIds: [123] };
    await expect(choose(1, false)).rejects.toThrow("configured");
  });
  it("locks choices once delivery is requested or the campaign is sent", async () => {
    await expect(service.chooseRecipient("owner", 100, 1, false, 0)).rejects.toThrow("locked");
    const review = await service.issue(101); await service.send("owner", 101, review.fingerprint);
    expect((await service.issueRecipients(101)).canEdit).toBe(false);
    await expect(choose(1, false)).rejects.toThrow("locked");
  });
  it("disables sending when every subscribed recipient is deselected", async () => {
    await choose(1, false); await choose(2, false);
    const review = await service.issue(101), send = vi.spyOn(brevo, "send");
    expect(review).toMatchObject({ eligibleCount: 0, canSend: false });
    await expect(service.send("owner", 101, review.fingerprint)).rejects.toThrow("selected");
    expect(send).not.toHaveBeenCalled();
  });
  it("keeps the subscribed mailing list and enforces the issue's exclusions before sending", async () => {
    await choose(1, false);
    const review = await service.issue(101), target = vi.spyOn(brevo, "target");
    const send = vi.spyOn(brevo, "send").mockImplementation(async id => {
      const selection = await store.selection(id, 999);
      expect(brevo.exclusionLists.get(selection.exclusionListId!)).toEqual([1]);
      expect((await brevo.campaign(id)).recipients).toEqual({ listIds: [999], exclusionListIds: [selection.exclusionListId] });
      expect((await store.approval(id))?.snapshot.selection).toEqual({ excludedIds: [1], revision: 1 });
    });
    await service.send("owner", 101, review.fingerprint);
    expect(send).toHaveBeenCalledOnce(); expect(target).toHaveBeenCalledOnce();
    expect((await brevo.contact(1))?.listIds).toEqual([999]);
    expect((await brevo.campaign(100)).recipients).toEqual({ listIds: [999] });
  });
  it("does not send after an uncertain preparation request and retains its list for safe review", async () => {
    await choose(1, false);
    const review = await service.issue(101), send = vi.spyOn(brevo, "send");
    vi.spyOn(brevo, "target").mockRejectedValue(new BrevoError(0, false, "Preparation timeout"));
    await expect(service.send("owner", 101, review.fingerprint)).rejects.toThrow("timeout");
    expect(send).not.toHaveBeenCalled(); expect(await store.approval(101)).toBeNull();
    expect((await store.selection(101, 999)).exclusionListId).not.toBeNull();
  });
  it("refuses delivery unless Brevo confirms the exact exclusion target", async () => {
    await choose(1, false);
    const review = await service.issue(101), send = vi.spyOn(brevo, "send");
    vi.spyOn(brevo, "target").mockResolvedValue(undefined);
    await expect(service.send("owner", 101, review.fingerprint)).rejects.toThrow("did not confirm");
    expect(send).not.toHaveBeenCalled();
  });
  it("detects content or subscription changes during preparation", async () => {
    await choose(1, false);
    const review = await service.issue(101), target = brevo.target.bind(brevo), send = vi.spyOn(brevo, "send");
    vi.spyOn(brevo, "target").mockImplementation(async (...args) => {
      await target(...args); brevo.campaigns[0].htmlContent += " changed";
    });
    await expect(service.send("owner", 101, review.fingerprint)).rejects.toThrow("during preparation");
    expect(send).not.toHaveBeenCalled();
  });
  it("refuses an exclusion list that was not created for this issue", async () => {
    brevo.campaigns[0].recipients = { listIds: [999], exclusionListIds: [555] };
    const review = await service.issue(101);
    expect(review.canSend).toBe(false);
    await expect(service.send("owner", 101, review.fingerprint)).rejects.toThrow("configured");
  });
  it("shares the delivery lock with choice changes", async () => {
    const token = await store.lock("list:999");
    await expect(choose(1, false)).rejects.toThrow("in progress");
    await store.unlock("list:999", token);
    await choose(1, false);
  });
});
