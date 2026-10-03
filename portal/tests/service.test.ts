import { beforeEach, describe, expect, it, vi } from "vitest";
import { DemoBrevo, DemoSheets, MemoryStore } from "@/lib/demo";
import { BrevoError } from "@/lib/errors";
import { PortalService } from "@/lib/service";

describe("review and delivery workflow", () => {
  let brevo: DemoBrevo, sheets: DemoSheets, store: MemoryStore, service: PortalService;
  beforeEach(() => { brevo = new DemoBrevo(); sheets = new DemoSheets(); store = new MemoryStore(); service = new PortalService(brevo, sheets, store, { listId: 999, enabled: true, reason: null }); });
  it("uses actual Brevo labels and puts the newest available draft first", async () => {
    brevo.campaigns[0].status = "sent";
    brevo.campaigns[1].status = "draft";
    brevo.campaigns[1].subject = "Updated provider subject";
    expect(await service.issues()).toMatchObject([
      { campaignId: 100, subject: "Updated provider subject", status: "draft" },
      { campaignId: 101, status: "sent" }
    ]);
  });
  it("ignores deleted Brevo campaigns and returns an empty history when none remain", async () => {
    vi.spyOn(brevo, "campaign").mockRejectedValue(new BrevoError(404, true, "Campaign missing"));
    expect(await service.issues()).toEqual([]);
  });
  it("reports provider outages instead of presenting them as an empty history", async () => {
    vi.spyOn(brevo, "campaign").mockRejectedValue(new BrevoError(500, false, "Unavailable"));
    await expect(service.issues()).rejects.toThrow("Unavailable");
  });
  it("shows draft eligibility and does not send on reads", async () => {
    const spy = vi.spyOn(brevo, "send"), detail = await service.issue(101);
    expect(detail).toMatchObject({ eligibleCount: 2, recipientCount: 3, status: "draft", canSend: true });
    expect(spy).not.toHaveBeenCalled();
  });
  it("records approval before contacting Brevo, then blocks repeated sends", async () => {
    const detail = await service.issue(101);
    const send = vi.spyOn(brevo, "send").mockImplementation(async id => { expect(await store.approval(id)).toMatchObject({ outcome: "submitting", approvedBy: "owner@example.com" }); });
    expect(await service.send("owner@example.com", 101, detail.fingerprint)).toMatchObject({ status: "submitted" });
    await expect(service.send("owner@example.com", 101, detail.fingerprint)).rejects.toThrow("already exists");
    expect(send).toHaveBeenCalledTimes(1);
    expect((await store.approval(101))?.snapshot.recipients).toHaveLength(3);
  });
  it("rejects a stale review after a recipient change", async () => {
    const detail = await service.issue(101), send = vi.spyOn(brevo, "send");
    await service.add("owner", "New Person", "new@example.com");
    await expect(service.send("owner", 101, detail.fingerprint)).rejects.toThrow("changed");
    expect(send).not.toHaveBeenCalled(); expect(await store.approval(101)).toBeNull();
  });
  it("rejects content changes and drafts outside project history", async () => {
    const detail = await service.issue(101), send = vi.spyOn(brevo, "send");
    brevo.campaigns[0].htmlContent += " changed";
    await expect(service.send("owner", 101, detail.fingerprint)).rejects.toThrow("changed");
    await expect(service.send("owner", 9999, detail.fingerprint)).rejects.toThrow("history"); expect(send).not.toHaveBeenCalled();
  });
  it("does not send with zero eligible recipients or a wrong campaign list", async () => {
    brevo.people.forEach(c => { c.emailBlacklisted = true; });
    const detail = await service.issue(101), send = vi.spyOn(brevo, "send");
    expect(detail.canSend).toBe(false);
    await expect(service.send("owner", 101, detail.fingerprint)).rejects.toThrow("no subscribed");
    brevo.people[0].emailBlacklisted = false; brevo.campaigns[0].recipients = { listIds: [10] };
    await expect(service.send("owner", 101, detail.fingerprint)).rejects.toThrow("configured"); expect(send).not.toHaveBeenCalled();
  });
  it("holds a shared lock against simultaneous sends and recipient edits", async () => {
    const detail = await service.issue(101);
    let finish!: () => void, entered!: () => void;
    const entering = new Promise<void>(resolve => { entered = resolve; });
    vi.spyOn(brevo, "send").mockImplementation(async () => { entered(); await new Promise<void>(resolve => { finish = resolve; }); });
    const first = service.send("owner", 101, detail.fingerprint);
    await entering;
    await expect(service.send("client", 101, detail.fingerprint)).rejects.toThrow("in progress");
    await expect(service.remove("client", 1)).rejects.toThrow("in progress");
    finish(); await first; expect(store.locks.size).toBe(0);
  });
  it("retains an unknown outcome and refuses retry even if Brevo still says draft", async () => {
    const detail = await service.issue(101), send = vi.spyOn(brevo, "send").mockRejectedValue(new BrevoError(0, false, "Timeout"));
    await expect(service.send("owner", 101, detail.fingerprint)).rejects.toThrow("unknown");
    expect((await service.issue(101)).status).toBe("unknown");
    await expect(service.send("owner", 101, detail.fingerprint)).rejects.toThrow("already exists"); expect(send).toHaveBeenCalledTimes(1);
  });
  it("reconciles an unknown send only when Brevo confirms sending or sent", async () => {
    const detail = await service.issue(101);
    vi.spyOn(brevo, "send").mockRejectedValue(new BrevoError(500, false, "Server error"));
    await expect(service.send("owner", 101, detail.fingerprint)).rejects.toThrow("unknown");
    brevo.campaigns[0].status = "queued"; expect((await service.issue(101)).status).toBe("submitted");
    brevo.campaigns[0].status = "sent"; expect((await service.issue(101)).status).toBe("sent");
  });
  it("allows a fresh confirmation after a definite Brevo rejection", async () => {
    const detail = await service.issue(101), send = vi.spyOn(brevo, "send").mockRejectedValueOnce(new BrevoError(402, true, "Insufficient credits"));
    await expect(service.send("owner", 101, detail.fingerprint)).rejects.toThrow("credits");
    expect((await store.approval(101))?.outcome).toBe("rejected");
    expect((await service.issue(101)).canSend).toBe(true);
    await service.send("owner", 101, (await service.issue(101)).fingerprint); expect(send).toHaveBeenCalledTimes(2);
  });
  it("does not lose approval or repeat delivery when Sheets updates fail", async () => {
    vi.spyOn(sheets, "sync").mockRejectedValue(new Error("Sheets unavailable"));
    const detail = await service.issue(101), send = vi.spyOn(brevo, "send");
    await service.send("owner", 101, detail.fingerprint);
    expect((await store.approval(101))?.outcome).toBe("submitted");
    expect((await store.approval(101))?.sheetSynced).toBe(false);
    expect((await service.issue(101)).canSend).toBe(false); expect(send).toHaveBeenCalledTimes(1);
  });
  it("retains submitting state if the database fails after Brevo accepts", async () => {
    const detail = await service.issue(101);
    vi.spyOn(brevo, "send").mockResolvedValue(undefined);
    vi.spyOn(store, "outcome").mockRejectedValue(new Error("Database unavailable"));
    await expect(service.send("owner", 101, detail.fingerprint)).rejects.toThrow("Database");
    expect((await store.approval(101))?.outcome).toBe("submitting");
    await expect(service.send("owner", 101, detail.fingerprint)).rejects.toThrow("already exists");
  });
  it("fails before sending when approval storage is unavailable", async () => {
    const detail = await service.issue(101), send = vi.spyOn(brevo, "send");
    vi.spyOn(store, "begin").mockRejectedValue(new Error("Database unavailable"));
    await expect(service.send("owner", 101, detail.fingerprint)).rejects.toThrow("Database"); expect(send).not.toHaveBeenCalled();
  });
  it("does not send if the deployment switch is disabled", async () => {
    const disabled = new PortalService(brevo, sheets, store, { listId: 999, enabled: false, reason: "Disabled" });
    await expect(disabled.send("owner", 101, "a".repeat(64))).rejects.toThrow("Disabled");
  });
  it("blocks resend for campaigns already sent outside the portal", async () => {
    const detail = await service.issue(100); expect(detail.canSend).toBe(false);
    await expect(service.send("owner", 100, detail.fingerprint)).rejects.toThrow("unsent draft");
  });
});

describe("recipient management", () => {
  let b: DemoBrevo, service: PortalService;
  beforeEach(() => { b = new DemoBrevo(); service = new PortalService(b, new DemoSheets(), new MemoryStore(), { listId: 999, enabled: true, reason: null }); });
  it("searches recipients by name or address", async () => { expect(await service.recipients("grace")).toHaveLength(1); expect(await service.recipients("notfound")).toHaveLength(0); });
  it("rejects duplicate recipients rather than silently overwriting them", async () => { await expect(service.add("owner", "Alex", "alex@example.com")).rejects.toThrow("already exists"); });
  it("blocks an unsubscribed address change but permits a name-only edit without EMAIL", async () => {
    const update = vi.spyOn(b, "update");
    await expect(service.update("owner", 3, "Sam Lee", "new@example.com")).rejects.toThrow("unsubscribe");
    await service.update("owner", 3, "Samuel Lee", "sam@example.com");
    expect(update).toHaveBeenCalledWith(3, "Samuel Lee", "");
    expect((await service.recipients()).find(r => r.id === 3)?.subscribed).toBe(false);
  });
  it("rejects access to a contact belonging to another mailing list", async () => {
    b.people.push({ id: 4, email: "outside@example.com", listIds: [123] });
    await expect(service.update("owner", 4, "Outside", "outside@example.com")).rejects.toThrow("does not belong");
    await expect(service.remove("owner", 4)).rejects.toThrow("does not belong");
  });
  it("removes only newsletter membership, preserving other lists and the contact", async () => {
    b.people[0].listIds = [999, 123]; await service.remove("owner", 1);
    expect(await b.contact(1)).toMatchObject({ listIds: [123], email: "alex@example.com" });
  });
  it("rejects changing to an existing contact's address", async () => { await expect(service.update("owner", 1, "Alex", "grace@example.com")).rejects.toThrow("already uses"); });
});
