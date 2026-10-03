import "server-only";
import { GoogleAuth } from "google-auth-library";
import { required } from "./config";
import { PortalError } from "./errors";
import type { IssueRow, SheetPort } from "./types";

export function parseIssues(values: string[][]): IssueRow[] {
  const headers = values[0] ?? [];
  const id = headers.indexOf("brevo_campaign_id"), date = headers.indexOf("issue_date"), subject = headers.indexOf("newsletter_subject");
  if (id < 0 || date < 0 || subject < 0) throw new PortalError(503, "The Issues sheet is missing its required column names.");
  const found = new Map<number, IssueRow>();
  for (const row of values.slice(1)) {
    const campaignId = Number(row[id]);
    if (!Number.isSafeInteger(campaignId) || campaignId < 1) continue;
    const issue = { campaignId, date: row[date] ?? "", subject: row[subject] ?? "" };
    const previous = found.get(campaignId);
    if (!previous || previous.date <= issue.date) found.set(campaignId, issue);
  }
  return [...found.values()].sort((a, b) => b.date.localeCompare(a.date) || b.campaignId - a.campaignId);
}
export class SheetsClient implements SheetPort {
  private async request<T>(suffix: string, method = "GET", body?: unknown): Promise<T> {
    let credentials;
    try { credentials = JSON.parse(required("GOOGLE_SERVICE_ACCOUNT_JSON")); }
    catch { throw new PortalError(503, "Google Sheets credentials need to be configured by the site owner."); }
    const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(required("GOOGLE_SHEET_ID"))}${suffix}`, {
      method, cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!response.ok) throw new PortalError(503, "The portal could not read or update the Issues sheet.");
    return response.json() as Promise<T>;
  }
  private async values() {
    return (await this.request<{ values?: string[][] }>("/values/Issues!A1:AZ")).values ?? [];
  }
  async issues() { return parseIssues(await this.values()); }
  async sync(id: number, outcome: string) {
    const values = await this.values();
    const campaignColumn = values[0]?.indexOf("brevo_campaign_id") ?? -1;
    const statusColumn = values[0]?.indexOf("approval_status") ?? -1;
    if (campaignColumn < 0 || statusColumn < 0) throw new PortalError(503, "The Issues sheet is missing its campaign or approval column.");
    // Headers remain unchanged. Update status cells only, never rewrite the sheet.
    const column = String.fromCharCode(65 + statusColumn % 26);
    const prefix = statusColumn >= 26 ? String.fromCharCode(64 + Math.floor(statusColumn / 26)) : "";
    const data = values.slice(1).flatMap((row, index) => Number(row[campaignColumn]) === id
      ? [{ range: `Issues!${prefix}${column}${index + 2}`, values: [[outcome]] }] : []);
    if (data.length) await this.request("/values:batchUpdate", "POST", { valueInputOption: "RAW", data });
  }
}
