import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), requireSameOrigin: vi.fn() }));
vi.mock("@/lib/access", () => mocks);
import { api, contactInput, jsonBody, parseId } from "@/lib/api";
import { PortalError } from "@/lib/errors";

describe("protected server routes", () => {
  beforeEach(() => { mocks.requireUser.mockReset(); mocks.requireSameOrigin.mockReset(); });
  it.each([false, true])("rejects unauthorized reads and writes before service execution (%s)", async mutate => {
    mocks.requireUser.mockRejectedValue(new PortalError(401, "Sign in"));
    const work = vi.fn(); const response = await api(new Request("https://portal.example.com/api/issues"), mutate, work);
    expect(response.status).toBe(401); expect(work).not.toHaveBeenCalled(); expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("checks mutation origin before touching Brevo", async () => {
    mocks.requireUser.mockResolvedValue("owner@example.com"); mocks.requireSameOrigin.mockImplementation(() => { throw new PortalError(403, "Wrong origin"); });
    const work = vi.fn(); expect((await api(new Request("https://portal.example.com"), true, work)).status).toBe(403); expect(work).not.toHaveBeenCalled();
  });
  it("does not leak unknown error details or credentials", async () => {
    mocks.requireUser.mockResolvedValue("owner@example.com");
    const response = await api(new Request("https://portal.example.com"), false, async () => { throw new Error("secret database credentials"); });
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
  it("rejects invalid addresses, empty names, extra input fields and invalid IDs", async () => {
    expect(contactInput.safeParse({ name: "A", email: "invalid" }).success).toBe(false);
    expect(contactInput.safeParse({ name: " ", email: "a@example.com" }).success).toBe(false);
    expect(contactInput.safeParse({ name: "A", email: "a@example.com", listId: 1 }).success).toBe(false);
    for (const value of ["0", "abc", "-1", "1.1", "1e2"]) expect(() => parseId(value)).toThrow("Invalid");
    await expect(jsonBody(new Request("https://portal.example.com", { method: "POST", body: "{" }), contactInput)).rejects.toThrow("read");
  });
});
