import { createHash } from "node:crypto";
import { PortalError } from "./errors";
import type { Campaign, Contact, Recipient, ReviewSnapshot } from "./types";

export function allowedEmails(value = process.env.PORTAL_ALLOWED_EMAILS ?? "") {
  const emails = value.split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  return emails.length === 2 && new Set(emails).size === 2 && emails.every(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) ? emails : [];
}
export function allowEmail(email: unknown, allow = allowedEmails()) {
  return typeof email === "string" && allow.includes(email.trim().toLowerCase());
}
export function isDemo(env: Record<string, string | undefined> = process.env) {
  return env.PORTAL_DEMO === "true" && env.NODE_ENV !== "production" && !env.VERCEL && !env.VERCEL_ENV;
}
export function deliveryPolicy(env: Record<string, string | undefined> = process.env): { listId: number; enabled: boolean; reason: string | null } {
  const productionList = Number(env.BREVO_LIST_ID);
  const testList = Number(env.PORTAL_TEST_LIST_ID);
  const testEnvironment = (Boolean(env.VERCEL_ENV) && env.VERCEL_ENV !== "production") || (!env.VERCEL_ENV && env.NODE_ENV !== "production");
  const listId = testEnvironment ? testList : productionList;
  if (!Number.isSafeInteger(listId) || listId < 1) return { listId: 0, enabled: false, reason: "The mailing list has not been configured." };
  if (testEnvironment && listId === productionList) return { listId: 0, enabled: false, reason: "Preview requires a separate test mailing list." };
  if (env.PORTAL_SEND_ENABLED !== "true") return { listId, enabled: false, reason: "Delivery is disabled by the site owner." };
  return { listId, enabled: true, reason: null };
}
export function recipient(contact: Contact, listId: number): Recipient {
  const a = contact.attributes ?? {};
  const name = typeof a.NEWSLETTER_NAME === "string" ? a.NEWSLETTER_NAME : [a.FIRSTNAME ?? a.FNAME ?? a.FIRST_NAME, a.LASTNAME ?? a.LNAME ?? a.LAST_NAME].filter(Boolean).join(" ");
  return { id: contact.id, email: contact.email ?? "", name,
    subscribed: Boolean(contact.email) && contact.emailBlacklisted !== true && !(contact.listUnsubscribed ?? []).includes(listId) };
}
export function validateCampaign(campaign: Campaign, listId: number, exclusionListId: number | null = null) {
  const r = campaign.recipients;
  // Brevo writes listIds but its campaign report returns lists/exclusionLists/segments.
  const lists = r?.listIds ?? r?.lists;
  if (!r || !Array.isArray(lists) || lists.length !== 1 || lists[0] !== listId
    || (r.lists !== undefined && (r.lists.length !== 1 || r.lists[0] !== listId))
    || [r.exclusionListIds, r.exclusionLists].some(ids => ids !== undefined && (!Array.isArray(ids) || (ids.length > 0 && (ids.length !== 1 || ids[0] !== exclusionListId))))
    || [r.segmentIds, r.segments, r.excludedSegments].some(ids => ids !== undefined && (!Array.isArray(ids) || ids.length > 0))
    || Object.keys(r).some(k => !["listIds", "lists", "exclusionListIds", "exclusionLists", "segmentIds", "segments", "excludedSegments"].includes(k))) {
    throw new PortalError(409, "This campaign does not target only the configured newsletter list.");
  }
  if (!campaign.subject?.trim() || !campaign.htmlContent?.trim()) throw new PortalError(409, "The draft is missing its subject or content.");
  if (campaign.abTesting || (campaign.type && campaign.type !== "classic")) throw new PortalError(409, "This portal only sends standard newsletter drafts.");
}
export function fingerprint(snapshot: ReviewSnapshot) {
  const c = snapshot.campaign;
  return createHash("sha256").update(JSON.stringify({
    id: c.id, subject: c.subject, html: c.htmlContent, status: c.status,
    sender: c.sender, targeting: c.recipients, scheduledAt: c.scheduledAt, type: c.type, abTesting: c.abTesting,
    listId: snapshot.listId, recipients: [...snapshot.recipients].sort((a, b) => a.id - b.id),
    selection: snapshot.selection ? { excludedIds: [...snapshot.selection.excludedIds].sort((a, b) => a - b), revision: snapshot.selection.revision } : undefined
  })).digest("hex");
}
export const statusLabel = (status: string) => ({
  draft: "Awaiting approval", submitting: "Outcome unknown", unknown: "Outcome unknown",
  submitted: "Submitted for sending", queued: "Submitted for sending", scheduled: "Submitted for sending",
  sent: "Sent", rejected: "Delivery request rejected", suspended: "Sending suspended", inProcess: "Sending in progress"
}[status] ?? status);
