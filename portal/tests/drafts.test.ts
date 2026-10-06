import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => mocks.sql }));

import { DraftService } from "@/lib/drafts";
import { GitHubDrafts } from "@/lib/github-drafts";

const requestId = "3b2bf729-b65a-465c-871d-a0194bea3dde";
const row = () => ({ request_id: requestId, actor: "owner@example.com", created_at: "2026-10-06T10:14:22Z", state: "unknown", run_id: 123, campaign_id: null, message: null });

describe("recovering draft requests after setup failure", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://test-only");
    vi.stubEnv("PORTAL_GITHUB_TOKEN", "test-credential");
    vi.stubEnv("VERCEL_ENV", "production");
    mocks.sql.mockReset();
    mocks.sql.mockImplementation(async (query: TemplateStringsArray, ...values: unknown[]) => {
      if (query[0].startsWith("UPDATE")) return [{ ...row(), state: values[0], message: values[3] }];
      return [row()];
    });
    vi.spyOn(GitHubDrafts.prototype, "workflow").mockResolvedValue({ id: 1, state: "active" });
    vi.spyOn(GitHubDrafts.prototype, "run").mockResolvedValue({ id: 123, workflow_id: 1, status: "completed", conclusion: "failure", display_title: `PPP draft production ${requestId}`, run_attempt: 1 });
    vi.spyOn(GitHubDrafts.prototype, "result").mockResolvedValue(null);
    vi.spyOn(GitHubDrafts.prototype, "failedBeforeDrafting").mockResolvedValue(true);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("resolves an existing uncertain request when setup failed before creation", async () => {
    expect(await new DraftService().detail(requestId)).toMatchObject({ state: "failed", campaignId: null, message: expect.stringContaining("before draft creation") });
  });
  it("keeps the request blocked if draft creation might have started", async () => {
    vi.mocked(GitHubDrafts.prototype.failedBeforeDrafting).mockResolvedValue(false);
    expect(await new DraftService().detail(requestId)).toMatchObject({ state: "unknown" });
  });
  it("does not clear a rerun because the first attempt may have created a campaign", async () => {
    vi.mocked(GitHubDrafts.prototype.run).mockResolvedValue({ id: 123, workflow_id: 1, status: "completed", conclusion: "failure", display_title: `PPP draft production ${requestId}`, run_attempt: 2 });
    expect(await new DraftService().detail(requestId)).toMatchObject({ state: "unknown" });
    expect(GitHubDrafts.prototype.failedBeforeDrafting).not.toHaveBeenCalled();
  });
  it("keeps a confirmed uncertain campaign result blocked", async () => {
    vi.mocked(GitHubDrafts.prototype.result).mockResolvedValue({ outcome: "unknown" });
    expect(await new DraftService().detail(requestId)).toMatchObject({ state: "unknown" });
    expect(GitHubDrafts.prototype.failedBeforeDrafting).not.toHaveBeenCalled();
  });
  it("does not change state when setup evidence cannot be read", async () => {
    vi.mocked(GitHubDrafts.prototype.failedBeforeDrafting).mockRejectedValue(new Error("GitHub unavailable"));
    await expect(new DraftService().detail(requestId)).rejects.toThrow("GitHub unavailable");
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
  it("rejects evidence from a different draft request", async () => {
    vi.mocked(GitHubDrafts.prototype.run).mockResolvedValue({ id: 123, workflow_id: 1, status: "completed", conclusion: "failure", display_title: "PPP draft production another-request", run_attempt: 1 });
    await expect(new DraftService().detail(requestId)).rejects.toThrow("does not match");
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
});
