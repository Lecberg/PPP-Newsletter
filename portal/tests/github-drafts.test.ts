import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubDrafts } from "@/lib/github-drafts";

const setupFailure = () => ({
  total_count: 1,
  jobs: [{
    name: "draft-newsletter", status: "completed", conclusion: "failure",
    steps: [
      { name: "Install dependencies", number: 4, status: "completed", conclusion: "failure" },
      { name: "Create draft or check automatic schedule", number: 5, status: "completed", conclusion: "skipped" },
      { name: "Save draft result", number: 6, status: "completed", conclusion: "success" },
    ],
  }],
});

describe("draft setup failure evidence", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("PORTAL_GITHUB_TOKEN", "test-credential");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("recognizes the observed install failure with skipped draft creation", async () => {
    fetchMock.mockResolvedValue(Response.json(setupFailure()));
    expect(await new GitHubDrafts().failedBeforeDrafting(123)).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain("runs/123/jobs?filter=latest&per_page=100");
  });
  it.each(["success", "failure", "cancelled"])("keeps a %s draft step uncertain without a result", async conclusion => {
    const jobs = setupFailure(); jobs.jobs[0].steps[1].conclusion = conclusion;
    fetchMock.mockResolvedValue(Response.json(jobs));
    expect(await new GitHubDrafts().failedBeforeDrafting(123)).toBe(false);
  });
  it("does not mistake a result-upload failure for a setup failure", async () => {
    const jobs = setupFailure();
    jobs.jobs[0].steps[0].conclusion = "success";
    jobs.jobs[0].steps[2].conclusion = "failure";
    fetchMock.mockResolvedValue(Response.json(jobs));
    expect(await new GitHubDrafts().failedBeforeDrafting(123)).toBe(false);
  });
  it.each(["cancelled", "in_progress"])("requires a finished failed job, not %s", async status => {
    const jobs = setupFailure(); jobs.jobs[0].status = status;
    fetchMock.mockResolvedValue(Response.json(jobs));
    expect(await new GitHubDrafts().failedBeforeDrafting(123)).toBe(false);
  });
  it("requires complete evidence from the known single-job workflow", async () => {
    const jobs = setupFailure(); jobs.total_count = 101;
    fetchMock.mockResolvedValue(Response.json(jobs));
    expect(await new GitHubDrafts().failedBeforeDrafting(123)).toBe(false);
    jobs.total_count = 1; jobs.jobs[0].name = "other-job";
    fetchMock.mockResolvedValue(Response.json(jobs));
    expect(await new GitHubDrafts().failedBeforeDrafting(123)).toBe(false);
  });
  it("does not infer failure if the draft step is missing", async () => {
    const jobs = setupFailure(); jobs.jobs[0].steps.splice(1, 1);
    fetchMock.mockResolvedValue(Response.json(jobs));
    expect(await new GitHubDrafts().failedBeforeDrafting(123)).toBe(false);
  });
  it("reports unavailable evidence without unlocking the request", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(new GitHubDrafts().failedBeforeDrafting(123)).rejects.toThrow("setup progress");
  });
});
