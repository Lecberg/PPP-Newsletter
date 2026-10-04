import "server-only";
import { randomUUID } from "node:crypto";
import { required } from "./config";
import { BrevoError, PortalError } from "./errors";
import type { BrevoPort, Campaign, Contact } from "./types";

export class BrevoClient implements BrevoPort {
  private async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`https://api.brevo.com/v3${path}`, {
        method, cache: "no-store", signal: AbortSignal.timeout(20_000),
        headers: { "api-key": required("BREVO_API_KEY"), "Content-Type": "application/json", Accept: "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (error) {
      if (error instanceof PortalError) throw error;
      throw new BrevoError(0, false, "Brevo did not confirm the request. Check its status before trying again.");
    }
    if (!response.ok) {
      if (response.status === 404) throw new BrevoError(404, true, "This contact or campaign could not be found.");
      if (response.status === 400) throw new BrevoError(400, true, "Brevo rejected these details. Check for a duplicate email or invalid campaign settings.");
      if (response.status === 402) throw new BrevoError(402, true, "Brevo needs sufficient sending credits before delivery.");
      throw new BrevoError(response.status, response.status >= 400 && response.status < 500 && response.status !== 408,
        response.status === 429 ? "Brevo is busy. Wait a moment before trying again." : "Brevo could not complete this request.");
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
  campaign(id: number) { return this.request<Campaign>(`/emailCampaigns/${id}`); }
  async contacts(listId: number) {
    const contacts: Contact[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await this.request<{ contacts: Contact[]; count: number }>(`/contacts/lists/${listId}/contacts?limit=500&offset=${offset}`);
      contacts.push(...page.contacts);
      if (page.contacts.length < 500) break;
      if (contacts.length >= 25_000) throw new PortalError(503, "This mailing list is too large for the portal. Contact the site owner.");
    }
    return contacts;
  }
  async contact(id: number | string) {
    try { return await this.request<Contact>(`/contacts/${encodeURIComponent(id)}`); }
    catch (error) { if (error instanceof BrevoError && error.status === 404) return null; throw error; }
  }
  private async nameAttributes(name: string) {
    const response = await this.request<{ attributes: { name: string; type: string; category: string }[] }>("/contacts/attributes");
    const attribute = response.attributes.find(a => a.name === "NEWSLETTER_NAME" && a.category === "normal");
    if (!attribute || attribute.type !== "text") throw new PortalError(503, "The site owner needs to configure the NEWSLETTER_NAME text field in Brevo.");
    return { NEWSLETTER_NAME: name };
  }
  async add(listId: number, name: string, email: string) {
    await this.request("/contacts", "POST", { email, attributes: await this.nameAttributes(name), listIds: [listId], updateEnabled: false });
  }
  async update(id: number, name: string, email: string) {
    await this.request(`/contacts/${id}`, "PUT", { attributes: { ...await this.nameAttributes(name), ...(email ? { EMAIL: email } : {}) } });
  }
  async remove(listId: number, id: number) {
    await this.request(`/contacts/lists/${listId}/contacts/remove`, "POST", { ids: [id] });
  }
  async createExclusionList(listId: number, campaignId: number) {
    const parent = await this.request<{ folderId: number }>(`/contacts/lists/${listId}`);
    const list = await this.request<{ id: number }>("/contacts/lists", "POST", {
      name: `PPP portal exclusions ${listId}-${campaignId}-${randomUUID()}`, folderId: parent.folderId
    });
    if (!Number.isSafeInteger(list.id) || list.id < 1 || list.id === listId) throw new PortalError(503, "Brevo did not confirm the exclusion list.");
    return list.id;
  }
  async setExcludedContacts(listId: number, ids: number[]) {
    const current = (await this.contacts(listId)).map(c => c.id), wanted = new Set(ids), existing = new Set(current);
    const remove = current.filter(id => !wanted.has(id)), add = ids.filter(id => !existing.has(id));
    for (const [operation, contacts] of [["remove", remove], ["add", add]] as const) {
      for (let offset = 0; offset < contacts.length; offset += 150) {
        await this.request(`/contacts/lists/${listId}/contacts/${operation}`, "POST", { ids: contacts.slice(offset, offset + 150) });
      }
    }
    const actual = (await this.contacts(listId)).map(c => c.id);
    if (actual.length !== wanted.size || actual.some(id => !wanted.has(id))) throw new PortalError(409, "Brevo has not confirmed the recipient choices. Refresh before sending.");
  }
  async target(id: number, listId: number, exclusionListId: number | null) {
    await this.request(`/emailCampaigns/${id}`, "PUT", { recipients: { listIds: [listId], exclusionListIds: exclusionListId ? [exclusionListId] : [] } });
  }
  async send(id: number) { await this.request(`/emailCampaigns/${id}/sendNow`, "POST"); }
}
