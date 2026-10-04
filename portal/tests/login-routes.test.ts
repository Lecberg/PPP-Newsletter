import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), native: vi.fn(), take: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: mocks.signIn, handlers: { GET: mocks.native, POST: mocks.native } }));
vi.mock("@/lib/email-login", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/email-login")>(), LoginLimiter: class { take = mocks.take; } }));
import { POST as requestLink } from "@/app/api/login/request/route";
import { POST as verifyLink } from "@/app/api/login/verify/route";
import { GET as nativeGet, POST as nativePost } from "@/app/api/auth/[...nextauth]/route";
import { acknowledgement } from "@/lib/email-login";

const origin = "https://portal.example.com";
const approved = "frankie.wong@todplus.com";
const token = "a".repeat(64);
function request(path: string, body: unknown, from = origin) {
  return new Request(origin + path, { method: "POST", headers: { origin: from, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.stubEnv("PORTAL_ALLOWED_EMAILS", approved + ",u3664746@connect.hku.hk");
  for (const [key, value] of Object.entries({ AUTH_URL: origin, AUTH_SECRET: "test-secret", AUTH_EMAIL_SENDER_ID: "1", DATABASE_URL: "test-db", BREVO_API_KEY: "test-key" })) vi.stubEnv(key, value);
  mocks.take.mockReset().mockResolvedValue(true);
  mocks.signIn.mockReset().mockResolvedValue(origin + "/login?provider=brevo&type=email");
  mocks.native.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("login link requests", () => {
  it("normalizes approved email and sends through the server login function", async () => {
    const response = await requestLink(request("/api/login/request", { email: " FRANKIE.WONG@TODPLUS.COM " }));
    expect(response.status).toBe(202); expect(await response.json()).toEqual(acknowledgement);
    expect(mocks.signIn).toHaveBeenCalledWith("brevo", { email: approved, redirect: false, redirectTo: origin + "/" });
    expect(mocks.take).toHaveBeenLastCalledWith("email", approved);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("gives strangers the same acknowledgement without sending or creating a user", async () => {
    const response = await requestLink(request("/api/login/request", { email: "stranger@example.com" }));
    expect(response.status).toBe(202); expect(await response.json()).toEqual(acknowledgement);
    expect(mocks.signIn).not.toHaveBeenCalled(); expect(mocks.take).toHaveBeenCalledTimes(1);
  });
  it.each(["network", "email"])("does not send when the %s limit is reached", async kind => {
    mocks.take.mockImplementation(async k => k !== kind);
    const response = await requestLink(request("/api/login/request", { email: approved }));
    expect(await response.json()).toEqual(acknowledgement); expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it("rejects cross-site requests before database or email access", async () => {
    expect((await requestLink(request("/api/login/request", { email: approved }, "https://stranger.example"))).status).toBe(403);
    expect(mocks.take).not.toHaveBeenCalled(); expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it.each([{ email: "invalid" }, { email: approved, callbackUrl: "https://stranger.example" }])("rejects malformed or unexpected input", async body => {
    expect((await requestLink(request("/api/login/request", body))).status).toBe(400);
    expect(mocks.take).not.toHaveBeenCalled();
  });
  it("fails closed and does not expose database or provider error details", async () => {
    mocks.take.mockRejectedValue(new Error("secret database password"));
    const response = await requestLink(request("/api/login/request", { email: approved }));
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("secret");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it("reports email service failure and never retries automatically", async () => {
    mocks.signIn.mockRejectedValue(new Error("provider includes raw token"));
    const response = await requestLink(request("/api/login/request", { email: approved }));
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("token");
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
  });
});

describe("link confirmation", () => {
  it("passes a confirmed POST to Auth.js internally and forwards session cookies", async () => {
    mocks.native.mockResolvedValue(new Response(null, { status: 302, headers: { Location: origin + "/", "Set-Cookie": "__Secure-authjs.session-token=verified; Path=/; HttpOnly; Secure; SameSite=Lax" } }));
    const response = await verifyLink(request("/api/login/verify", { email: approved, token }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ redirectTo: "/" });
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    const internal = mocks.native.mock.calls[0][0] as Request;
    expect(new URL(internal.url).searchParams.get("token")).toBe(token);
    expect(response.headers.get("Location")).toBeNull();
  });
  it("refuses an expired, reused, or invalid link without forwarding cookies", async () => {
    mocks.native.mockResolvedValue(new Response(null, { status: 302, headers: { Location: origin + "/login?error=Verification" } }));
    const response = await verifyLink(request("/api/login/verify", { email: approved, token }));
    expect(response.status).toBe(400); expect(response.headers.get("Set-Cookie")).toBeNull();
  });
  it("rechecks approved addresses at confirmation time", async () => {
    const response = await verifyLink(request("/api/login/verify", { email: "stranger@example.com", token }));
    expect(response.status).toBe(400); expect(mocks.native).not.toHaveBeenCalled();
  });
  it("rejects cross-origin verification without consuming the token", async () => {
    expect((await verifyLink(request("/api/login/verify", { email: approved, token }, "https://stranger.example"))).status).toBe(403);
    expect(mocks.native).not.toHaveBeenCalled();
  });
  it.each(["signin/brevo", "callback/brevo", "signin/google", "callback/google"])("blocks direct %s requests in both methods", async path => {
    expect((await nativeGet(new NextRequest(`${origin}/api/auth/${path}?token=${token}`))).status).toBe(404);
    expect((await nativePost(new NextRequest(`${origin}/api/auth/${path}`, { method: "POST" }))).status).toBe(404);
    expect(mocks.native).not.toHaveBeenCalled();
  });
});
