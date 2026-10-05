import { beforeEach, describe, expect, it, vi } from "vitest";
import { PortalError } from "@/lib/errors";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), requireSameOrigin: vi.fn(), issueRecipients: vi.fn(), chooseRecipient: vi.fn() }));
vi.mock("@/lib/access", () => ({ requireUser: mocks.requireUser, requireSameOrigin: mocks.requireSameOrigin }));
vi.mock("@/lib/runtime", () => ({ service: () => mocks }));
import { GET } from "@/app/api/issues/[campaignId]/recipients/route";
import { PATCH } from "@/app/api/issues/[campaignId]/recipients/[contactId]/route";
const context = () => ({ params: Promise.resolve({ campaignId: "13", contactId: "7" }) });
const request = (body: unknown = { included: false, revision: 0 }) => new Request("https://portal.example.com/api/issues/13/recipients/7", { method: "PATCH", body: JSON.stringify(body) });
describe("protected receiver-choice routes", () => {
  beforeEach(() => { Object.values(mocks).forEach(mock => mock.mockReset()); mocks.requireUser.mockResolvedValue("owner@example.com"); });
  it("rejects signed-out reads and writes before accessing choices", async () => {
    mocks.requireUser.mockRejectedValue(new PortalError(401, "Sign in"));
    expect((await GET(new Request("https://portal.example.com"), context())).status).toBe(401);
    expect((await PATCH(request(), context())).status).toBe(401);
    expect(mocks.issueRecipients).not.toHaveBeenCalled(); expect(mocks.chooseRecipient).not.toHaveBeenCalled();
  });
  it("rejects cross-site changes before saving", async () => {
    mocks.requireSameOrigin.mockImplementation(() => { throw new PortalError(403, "Wrong origin"); });
    expect((await PATCH(request(), context())).status).toBe(403); expect(mocks.chooseRecipient).not.toHaveBeenCalled();
  });
  it("rejects extra targeting fields, nonboolean choices and invalid revision numbers", async () => {
    for (const body of [{ included: false, revision: 0, listId: 5 }, { included: "false", revision: 0 }, { included: true, revision: -1 }]) {
      expect((await PATCH(request(body), context())).status).toBe(400);
    }
    expect(mocks.chooseRecipient).not.toHaveBeenCalled();
  });
  it("passes only validated issue, contact, choice and revision to the service", async () => {
    const response = await PATCH(request(), context());
    expect(response.status).toBe(200); expect(mocks.chooseRecipient).toHaveBeenCalledWith("owner@example.com", 13, 7, false, 0);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("returns uncached selections and reports stale reviews", async () => {
    mocks.issueRecipients.mockResolvedValue({ campaignId: 13, recipients: [] });
    expect((await GET(new Request("https://portal.example.com"), context())).headers.get("Cache-Control")).toContain("no-store");
    mocks.chooseRecipient.mockRejectedValue(new PortalError(409, "Changed"));
    expect((await PATCH(request(), context())).status).toBe(409);
  });
});
