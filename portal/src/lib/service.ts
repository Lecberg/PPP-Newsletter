import { BrevoError, PortalError } from "./errors";
import { fingerprint, recipient, validateCampaign } from "./policy";
import type { Approval, BrevoPort, Contact, IssueDetail, IssueRow, SheetPort, StorePort } from "./types";

export class PortalService {
  constructor(private brevo: BrevoPort, private sheets: SheetPort, private store: StorePort,
    private delivery: { listId: number; enabled: boolean; reason: string | null }) {}

  async issues() {
    const rows = await this.sheets.issues(), found: IssueRow[] = [];
    // Limit provider requests while replacing Sheet labels with actual campaign data.
    for (let start = 0; start < rows.length; start += 4) {
      const batch = await Promise.all(rows.slice(start, start + 4).map(async row => {
        try {
          const campaign = await this.brevo.campaign(row.campaignId);
          return { ...row, subject: campaign.subject, status: campaign.status };
        } catch (error) {
          if (error instanceof BrevoError && error.status === 404) return null;
          throw error;
        }
      }));
      found.push(...batch.filter((row): row is IssueRow & { status: string } => row !== null));
    }
    // Sheet order is newest first. Keep that order within drafts and history.
    return [...found.filter(row => row.status === "draft"), ...found.filter(row => row.status !== "draft")];
  }
  private async knownIssue(id: number): Promise<IssueRow> {
    const row = (await this.sheets.issues()).find(r => r.campaignId === id);
    if (!row) throw new PortalError(404, "This newsletter is not in the project's issue history.");
    return row;
  }
  private listId() {
    if (!this.delivery.listId) throw new PortalError(503, this.delivery.reason ?? "The mailing list needs to be configured.");
    return this.delivery.listId;
  }
  private async withLock<T>(operation: string, work: () => Promise<T>): Promise<T> {
    const scope = `list:${this.listId()}`;
    const token = await this.store.lock(scope, operation);
    try { return await work(); }
    finally { await this.store.unlock(scope, token); }
  }
  private async syncApproval(a: Approval) {
    if (!a.sheetSynced) {
      try { await this.sheets.sync(a.campaignId, a.outcome); await this.store.synced(a.campaignId); }
      catch { /* A later authenticated status read retries this. Never repeat a delivery. */ }
    }
  }
  async issue(id: number): Promise<IssueDetail> {
    const row = await this.knownIssue(id), listId = this.listId();
    const [campaign, contacts, initialApproval] = await Promise.all([
      this.brevo.campaign(id), this.brevo.contacts(listId), this.store.approval(id)
    ]);
    let approval = initialApproval;
    // Reconciliation shares the mutation lock, so old reads cannot overwrite newer status.
    const positive = ["sent", "queued", "scheduled", "inProcess"].includes(campaign.status);
    if (approval && (!approval.sheetSynced || (positive && approval.outcome !== "sent" && approval.outcome !== (campaign.status === "sent" ? "sent" : "submitted")))) {
      approval = await this.withLock("reconcile_status", async () => {
        let current = await this.store.approval(id);
        if (!current) return null;
        const provider = await this.brevo.campaign(id);
        if (current.outcome !== "sent" && ["sent", "queued", "scheduled", "inProcess"].includes(provider.status)) {
          const outcome = provider.status === "sent" ? "sent" : "submitted";
          if (current.outcome !== outcome) { await this.store.outcome(id, outcome); current = { ...current, outcome, sheetSynced: false }; }
        }
        await this.syncApproval(current);
        return current;
      });
    }
    const recipients = contacts.map(c => recipient(c, listId));
    let reason = this.delivery.reason;
    try { validateCampaign(campaign, listId); } catch (error) { reason = (error as Error).message; }
    if (campaign.status !== "draft") reason = "This campaign is no longer an unsent draft.";
    if (approval && approval.outcome !== "rejected") reason = "This campaign already has a delivery request. Refresh to check its status.";
    if (!recipients.some(r => r.subscribed)) reason = "Add at least one subscribed recipient before sending.";
    return { ...row, subject: campaign.subject, html: campaign.htmlContent,
      status: approval && approval.outcome !== "rejected" ? approval.outcome : campaign.status,
      eligibleCount: recipients.filter(r => r.subscribed).length, recipientCount: recipients.length,
      fingerprint: fingerprint({ campaign, recipients, listId }),
      canSend: this.delivery.enabled && !reason, sendDisabledReason: reason,
      approval: approval ? { approvedBy: approval.approvedBy, approvedAt: approval.approvedAt, outcome: approval.outcome } : null };
  }
  async recipients(search = "") {
    const q = search.toLowerCase().trim(), listId = this.listId();
    return (await this.brevo.contacts(listId)).map(c => recipient(c, listId))
      .filter(r => !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
  }
  private async member(id: number): Promise<Contact> {
    const listId = this.listId();
    const contact = await this.brevo.contact(id);
    if (!contact || !(contact.listIds ?? []).includes(listId)) throw new PortalError(404, "This recipient does not belong to the newsletter list.");
    return contact;
  }
  async add(actor: string, name: string, email: string) {
    return this.withLock("add_recipient", async () => {
      if (await this.brevo.contact(email)) throw new PortalError(409, "This email already exists in Brevo. Ask the owner to check its list membership.");
      await this.store.log(actor, "add_recipient", email, "attempt");
      await this.brevo.add(this.listId(), name, email);
      await this.store.log(actor, "add_recipient", email, "completed");
    });
  }
  async update(actor: string, id: number, name: string, email: string) {
    return this.withLock("edit_recipient", async () => {
      const contact = await this.member(id);
      const changingEmail = (contact.email ?? "").toLowerCase() !== email.toLowerCase();
      if (changingEmail && !recipient(contact, this.listId()).subscribed) throw new PortalError(409, "An unsubscribed recipient's email cannot be changed here. Their unsubscribe choice must be preserved.");
      if (changingEmail) {
        const duplicate = await this.brevo.contact(email);
        if (duplicate && duplicate.id !== id) throw new PortalError(409, "Another contact already uses this email address.");
      }
      await this.store.log(actor, "edit_recipient", String(id), "attempt");
      // Omit EMAIL entirely for name-only edits. Brevo must not reset suppression.
      await this.brevo.update(id, name, changingEmail ? email : "");
      await this.store.log(actor, "edit_recipient", String(id), "completed");
    });
  }
  async remove(actor: string, id: number) {
    return this.withLock("remove_recipient", async () => {
      await this.member(id);
      await this.store.log(actor, "remove_recipient", String(id), "attempt");
      await this.brevo.remove(this.listId(), id);
      await this.store.log(actor, "remove_recipient", String(id), "completed");
    });
  }
  async send(actor: string, id: number, reviewedFingerprint: string) {
    if (!this.delivery.enabled) throw new PortalError(403, this.delivery.reason ?? "Delivery is disabled.");
    return this.withLock("send_campaign", async () => {
      await this.knownIssue(id);
      const listId = this.listId();
      const [campaign, contacts, existing] = await Promise.all([
        this.brevo.campaign(id), this.brevo.contacts(listId), this.store.approval(id)
      ]);
      if (existing && existing.outcome !== "rejected") throw new PortalError(409, "A delivery request already exists. Refresh to check its status.");
      if (campaign.status !== "draft") throw new PortalError(409, "This campaign is no longer an unsent draft.");
      validateCampaign(campaign, listId);
      const recipients = contacts.map(c => recipient(c, listId));
      if (!recipients.some(r => r.subscribed)) throw new PortalError(409, "There are no subscribed recipients.");
      const snapshot = { campaign, recipients, listId }, freshFingerprint = fingerprint(snapshot);
      if (freshFingerprint !== reviewedFingerprint) throw new PortalError(409, "The draft or recipients changed. Refresh and review them again before sending.");
      // This durable record is committed BEFORE any external send request.
      await this.store.begin({ campaignId: id, listId, approvedBy: actor, fingerprint: freshFingerprint, snapshot, outcome: "submitting" });
      try { await this.brevo.send(id); }
      catch (error) {
        const definite = error instanceof BrevoError && error.definite;
        await this.store.outcome(id, definite ? "rejected" : "unknown", (error as Error).message);
        const a = await this.store.approval(id);
        if (a) await this.syncApproval(a);
        if (definite) throw new PortalError(502, (error as Error).message);
        throw new PortalError(409, "Delivery outcome is unknown. Refresh to check Brevo's status. Do not send this newsletter again.");
      }
      await this.store.outcome(id, "submitted");
      const a = await this.store.approval(id);
      if (a) await this.syncApproval(a);
      return { status: "submitted", message: "Brevo accepted this newsletter for sending." };
    });
  }
}
