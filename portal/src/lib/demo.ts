import "server-only";
import { randomUUID } from "node:crypto";
import { PortalError } from "./errors";
import type { Approval, ApprovalOutcome, BrevoPort, Campaign, Contact, RecipientSelection, SheetPort, StorePort } from "./types";

export class MemoryStore implements StorePort {
  selections = new Map<string, RecipientSelection>();
  async selection(id: number, listId: number) { return structuredClone(this.selections.get(`${listId}:${id}`) ?? { excludedIds: [], revision: 0, exclusionListId: null }); }
  async setSelection(id: number, listId: number, contactId: number, included: boolean, revision: number) {
    const current = await this.selection(id, listId);
    if (current.revision !== revision) throw new PortalError(409, "Recipient choices changed in another tab. Refresh and choose again.");
    current.excludedIds = included ? current.excludedIds.filter(n => n !== contactId) : [...new Set([...current.excludedIds, contactId])];
    current.revision++; this.selections.set(`${listId}:${id}`, current);
  }
  async setExclusionList(id: number, listId: number, exclusionListId: number) {
    const current = await this.selection(id, listId); current.exclusionListId = exclusionListId; this.selections.set(`${listId}:${id}`, current);
  }
  locks = new Map<string, string>();
  approvals = new Map<number, Approval>();
  operations: { actor: string; operation: string; target: string; outcome: string }[] = [];
  async lock(scope: string) {
    if (this.locks.has(scope)) throw new PortalError(409, "Another operation is in progress.");
    const token = randomUUID(); this.locks.set(scope, token); return token;
  }
  async unlock(scope: string, token: string) { if (this.locks.get(scope) === token) this.locks.delete(scope); }
  async approval(id: number) { return this.approvals.get(id) ?? null; }
  async begin(a: Omit<Approval, "approvedAt" | "sheetSynced">) {
    const old = this.approvals.get(a.campaignId);
    if (old && old.outcome !== "rejected") throw new PortalError(409, "Delivery request already exists.");
    this.approvals.set(a.campaignId, { ...a, approvedAt: new Date().toISOString(), sheetSynced: false });
  }
  async outcome(id: number, outcome: ApprovalOutcome, detail?: string) {
    const a = this.approvals.get(id); if (a) { a.outcome = outcome; a.detail = detail; a.sheetSynced = false; }
  }
  async synced(id: number) { const a = this.approvals.get(id); if (a) a.sheetSynced = true; }
  async log(actor: string, operation: string, target: string, outcome: string) { this.operations.push({ actor, operation, target, outcome }); }
}
export const demoHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;padding:36px;color:#10213b;background:white;font:16px/1.55 'Segoe UI',Arial,sans-serif}h1,h2,h3{font-family:Georgia,serif;line-height:1.2}h1{font-size:36px;margin:0 0 8px}h2{font-size:27px;margin:24px 0 5px}h3{font-size:22px;margin:22px 0 7px}.date{float:right;text-align:right;font-size:13px;color:#526178}p{margin:8px 0;color:#4b5b70}.zh{font-family:'Microsoft JhengHei',sans-serif}hr{border:0;border-top:1px solid #bfcada;margin:16px 0}a{color:#0b3d6b}.source{font-size:13px}.note{font-size:12px;color:#64748b}@media(max-width:600px){body{padding:20px}h1{font-size:27px}.date{float:none;text-align:left;margin-bottom:15px}}
</style></head><body><div class="date">3 October 2026<br>2026年10月3日</div><h1>Hong Kong PPP Weekly</h1><p>A weekly review of public-private partnership news and insights for Hong Kong</p><hr><h2>Infrastructure &amp; Development</h2><div class="zh">基礎建設與發展</div><hr><h3>Sample: planning future logistics infrastructure</h3><strong class="zh">示例：規劃未來物流基建</strong><p>This sample article shows how an English news summary will appear in the newsletter. Your real draft will come directly from Brevo.</p><p class="zh">這是一段示例新聞摘要，用來展示繁體中文內容的排版。正式草稿會直接從 Brevo 載入。</p><p class="source">Source: <a href="https://example.com">Sample News</a>　|　來源：示例新聞</p><hr><h3>Sample: exploring green port development</h3><strong class="zh">示例：探討綠色港口發展</strong><p>This second sample shows the spacing between articles. The portal preserves the content and layout of your generated email.</p><p class="zh">第二段示例展示文章之間的間距。網站會保留系統產生的電郵內容及排版。</p><p class="source">Source: <a href="https://example.com">Sample Analysis</a>　|　來源：示例分析</p><hr><p class="note">Local demonstration · sample content · no real emails</p></body></html>`;
export class DemoBrevo implements BrevoPort {
  exclusionLists = new Map<number, number[]>();
  async createExclusionList() { const id = 10000 + this.exclusionLists.size; this.exclusionLists.set(id, []); return id; }
  async setExcludedContacts(listId: number, ids: number[]) { this.exclusionLists.set(listId, [...ids]); }
  async target(id: number, listId: number, exclusionListId: number) {
    const campaign = this.campaigns.find(c => c.id === id);
    if (campaign) campaign.recipients = { listIds: [listId], exclusionListIds: [exclusionListId] };
  }
  campaigns: Campaign[] = [{ id: 101, subject: "Hong Kong PPP Weekly — 3 October 2026", htmlContent: demoHtml, status: "draft", recipients: { listIds: [999] }, sender: { email: "newsletter@example.com" }, type: "classic" },
    { id: 100, subject: "Hong Kong PPP Weekly — 26 September 2026", htmlContent: demoHtml.replace("3 October 2026", "26 September 2026").replace("2026年10月3日", "2026年9月26日"), status: "sent", recipients: { listIds: [999] }, type: "classic" }];
  people: Contact[] = [{ id: 1, email: "alex@example.com", attributes: { NEWSLETTER_NAME: "Alex Chan" }, listIds: [999] }, { id: 2, email: "grace@example.com", attributes: { NEWSLETTER_NAME: "Grace Wong" }, listIds: [999] }, { id: 3, email: "sam@example.com", attributes: { NEWSLETTER_NAME: "Sam Lee" }, emailBlacklisted: true, listIds: [999] }];
  async campaign(id: number) { const c = this.campaigns.find(c => c.id === id); if (!c) throw new PortalError(404, "Campaign not found."); return structuredClone(c); }
  async contacts(listId: number) { return structuredClone(this.people.filter(c => c.listIds?.includes(listId))); }
  async contact(id: number | string) { return structuredClone(this.people.find(c => c.id === id || c.email === id) ?? null); }
  async add(listId: number, name: string, email: string) { this.people.push({ id: Math.max(0, ...this.people.map(c => c.id)) + 1, email, attributes: { NEWSLETTER_NAME: name }, listIds: [listId] }); }
  async update(id: number, name: string, email: string) { const c = this.people.find(c => c.id === id); if (c) { c.attributes = { NEWSLETTER_NAME: name }; if (email) c.email = email; } }
  async remove(listId: number, id: number) { const c = this.people.find(c => c.id === id); if (c) c.listIds = c.listIds?.filter(n => n !== listId); }
  async send(id: number) { const c = this.campaigns.find(c => c.id === id); if (c) c.status = "queued"; }
}
export class DemoSheets implements SheetPort {
  async issues() { return [{ campaignId: 101, date: "2026-10-03", subject: "Hong Kong PPP Weekly — 3 October 2026" }, { campaignId: 100, date: "2026-09-26", subject: "Hong Kong PPP Weekly — 26 September 2026" }]; }
  async sync() {}
}
