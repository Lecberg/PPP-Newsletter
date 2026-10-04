import { describe, expect, it } from "vitest";
import { allowEmail, allowedEmails, deliveryPolicy, fingerprint, isDemo, recipient, validateCampaign } from "@/lib/policy";
import { parseIssues } from "@/lib/sheets";
import { DemoBrevo } from "@/lib/demo";

describe("private access", () => {
  const allow = allowedEmails("frankie.wong@todplus.com,u3664746@connect.hku.hk");
  it("allows exactly the two configured email addresses", () => {
    expect(allowEmail("frankie.wong@todplus.com", allow)).toBe(true);
    expect(allowEmail(" U3664746@CONNECT.HKU.HK ", allow)).toBe(true);
    expect(allowEmail("stranger@todplus.com", allow)).toBe(false);
    expect(allowEmail(null, allow)).toBe(false);
    expect(allowEmail(true, allow)).toBe(false);
  });
  it("fails closed for missing, duplicate, or excessive allowed accounts", () => {
    for (const value of ["", "a@example.com", "a@example.com,a@example.com", "a@example.com,b@example.com,c@example.com", "a,b"]) expect(allowedEmails(value)).toEqual([]);
  });
  it("cannot enable local demonstration in any Vercel or production environment", () => {
    expect(isDemo({ PORTAL_DEMO: "true", NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isDemo({ PORTAL_DEMO: "true", NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false);
    expect(isDemo({ PORTAL_DEMO: "true", VERCEL: "1" })).toBe(false);
    expect(isDemo({ PORTAL_DEMO: "true", VERCEL_ENV: "preview" })).toBe(false);
  });
});
describe("environment separation", () => {
  const production = { NODE_ENV: "production", VERCEL_ENV: "production", BREVO_LIST_ID: "10", PORTAL_SEND_ENABLED: "true" } as NodeJS.ProcessEnv;
  it("uses production list only in production", () => { expect(deliveryPolicy(production)).toMatchObject({ listId: 10, enabled: true }); });
  it("requires a distinct preview test list", () => {
    expect(deliveryPolicy({ ...production, VERCEL_ENV: "preview" }).enabled).toBe(false);
    expect(deliveryPolicy({ ...production, VERCEL_ENV: "preview", PORTAL_TEST_LIST_ID: "10" }).listId).toBe(0);
    expect(deliveryPolicy({ ...production, VERCEL_ENV: "preview", PORTAL_TEST_LIST_ID: "11" })).toMatchObject({ listId: 11, enabled: true });
  });
  it("requires an explicit delivery switch", () => { expect(deliveryPolicy({ ...production, PORTAL_SEND_ENABLED: "false" }).enabled).toBe(false); });
});
describe("review rules", () => {
  it("ignores local-only issues and combines duplicate campaign rows", () => {
    expect(parseIssues([["issue_date", "brevo_campaign_id", "newsletter_subject"], ["2026-10-02", "", "Local only"], ["2026-10-01", "101", "Older"], ["2026-10-03", "101", "Newer"], ["2026-10-02", "100", "Previous"], ["2026-10-04", "abc", "Invalid"]])).toEqual([{ campaignId: 101, date: "2026-10-03", subject: "Newer" }, { campaignId: 100, date: "2026-10-02", subject: "Previous" }]);
  });
  it("fails clearly for missing headers", () => { expect(() => parseIssues([])).toThrow("column"); });
  it("excludes global and list-specific unsubscribes and contacts without emails", () => {
    expect(recipient({ id: 1, email: "a@example.com", emailBlacklisted: true }, 10).subscribed).toBe(false);
    expect(recipient({ id: 1, email: "a@example.com", listUnsubscribed: [10] }, 10).subscribed).toBe(false);
    expect(recipient({ id: 1 }, 10).subscribed).toBe(false);
  });
  it("rejects campaigns targeting another or additional list", async () => {
    const c = await new DemoBrevo().campaign(101);
    expect(() => validateCampaign(c, 10)).toThrow("configured");
    expect(() => validateCampaign({ ...c, recipients: { listIds: [999, 10] } }, 999)).toThrow("configured");
    expect(() => validateCampaign({ ...c, recipients: { listIds: [999], exclusionListIds: [10] } }, 999)).toThrow("configured");
    expect(() => validateCampaign({ ...c, recipients: { listIds: [999], segmentIds: [1] } }, 999)).toThrow("configured");
    expect(() => validateCampaign({ ...c, htmlContent: "" }, 999)).toThrow("missing");
    expect(() => validateCampaign({ ...c, recipients: { lists: [999], exclusionLists: [], segments: [], excludedSegments: [] } }, 999)).not.toThrow();
    expect(() => validateCampaign({ ...c, recipients: { lists: [999], exclusionLists: [10] } }, 999)).toThrow("configured");
    expect(() => validateCampaign({ ...c, recipients: { lists: [999], segments: [10] } }, 999)).toThrow("configured");
    expect(() => validateCampaign({ ...c, recipients: { listIds: [999], lists: [10] } }, 999)).toThrow("configured");
  });
  it("detects content, sender, recipient, and subscription changes but ignores contact order", async () => {
    const b = new DemoBrevo(), campaign = await b.campaign(101), recipients = (await b.contacts(999)).map(c => recipient(c, 999));
    const snap = { campaign, recipients, listId: 999 }, value = fingerprint(snap);
    expect(fingerprint({ ...snap, recipients: [...recipients].reverse() })).toBe(value);
    expect(fingerprint({ ...snap, campaign: { ...campaign, subject: "Changed" } })).not.toBe(value);
    expect(fingerprint({ ...snap, campaign: { ...campaign, htmlContent: "Changed" } })).not.toBe(value);
    expect(fingerprint({ ...snap, campaign: { ...campaign, sender: { email: "other@example.com" } } })).not.toBe(value);
    expect(fingerprint({ ...snap, recipients: recipients.map((r, i) => i ? r : { ...r, subscribed: false }) })).not.toBe(value);
  });
});
