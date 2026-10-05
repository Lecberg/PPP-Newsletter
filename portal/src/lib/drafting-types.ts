export type NewsSource = { rowId: number | null; name: string; url: string; sourceType: string; priority: number; enabled: boolean };
export type PortalSettings = {
  version: string; sources: NewsSource[]; keywords: string; cadence: "weekly" | "monthly";
  weekday: string; monthDay: number; hour: number; timezone: string; automaticDrafting: boolean;
};
export type DraftState = "submitting" | "queued" | "running" | "ready" | "failed" | "unknown";
export type DraftRun = { requestId: string; actor: string; createdAt: string; state: DraftState; runId: number | null; campaignId: number | null; message: string | null };
export type DraftOverview = { available: boolean; reason: string | null; runs: DraftRun[] };
