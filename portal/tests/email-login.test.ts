import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emailAuthCallbacks } from "@/lib/auth-callbacks";
import { canonicalOrigin, loginEmailInput, loginLink, loginReady, requestNetwork, sendLoginEmail } from "@/lib/email-login";
const approved = "frankie.wong@todplus.com";
const token = "a".repeat(64);
beforeEach(() => {
  for (const [key, value] of Object.entries({ PORTAL_ALLOWED_EMAILS: approved + ",u3664746@connect.hku.hk", AUTH_URL: "https://portal.example.com", AUTH_SECRET: "test-secret", AUTH_EMAIL_SENDER_ID: "1", DATABASE_URL: "test-db", BREVO_API_KEY: "test-key", VERCEL: "1", VERCEL_ENV: "production" })) vi.stubEnv(key, value);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("email login configuration", () => {
  it("requires complete server configuration and exactly two allowed addresses", () => {
    expect(loginReady()).toBe(true);
    vi.stubEnv("PORTAL_ALLOWED_EMAILS", approved); expect(loginReady()).toBe(false);
  });
  it("normalizes addresses without accepting commas, extra @ symbols, or empty addresses", () => {
    expect(loginEmailInput.parse({ email: " FRANKIE.WONG@TODPLUS.COM " }).email).toBe(approved);
    for (const email of ["", "a@b.com,c@d.com", "a@b@c.com"]) expect(loginEmailInput.safeParse({ email }).success).toBe(false);
  });
  it("puts the token in the fragment, outside the server-visible URL", () => {
    const link = new URL(loginLink(approved, token));
    expect(link.pathname).toBe("/login/verify"); expect(link.search).toBe(""); expect(link.hash).toContain(token);
    expect(() => canonicalOrigin({ AUTH_URL: "http://portal.example.com", VERCEL: "1" })).toThrow();
  });
  it("ignores spoofable forwarding headers outside Vercel", () => {
    const req = new Request("https://portal.example.com", { headers: { "x-forwarded-for": "fake", "x-vercel-forwarded-for": "verified" } });
    expect(requestNetwork(req, {})).toBe("local"); expect(requestNetwork(req, { VERCEL: "1" })).toBe("verified");
  });
});
describe("login mail", () => {
  it("uses only the individual email API and the existing sender", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"messageId":"sample"}', { status: 201 })); vi.stubGlobal("fetch", fetcher);
    await sendLoginEmail(approved, token, new Date(Date.now() + 600_000));
    const [url, options] = fetcher.mock.calls[0]; const body = JSON.parse(options.body);
    expect(url).toBe("https://api.brevo.com/v3/smtp/email"); expect(body.sender).toEqual({ id: 1 }); expect(body.to).toEqual([{ email: approved }]);
    expect(body.subject).not.toContain("[Preview]"); expect(body.textContent).toContain("/login/verify#"); expect(body).not.toHaveProperty("listIds");
  });
  it("labels preview emails and links to the configured preview origin", async () => {
    vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("AUTH_URL", "https://preview.example.com");
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 201 })); vi.stubGlobal("fetch", fetcher);
    await sendLoginEmail(approved, token, new Date(Date.now() + 600_000));
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.subject).toContain("[Preview]"); expect(body.textContent).toContain("https://preview.example.com/login/verify#");
  });
  it("never sends to an unapproved inbox", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(sendLoginEmail("stranger@example.com", token, new Date())).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not expose provider bodies on failure or repeat an uncertain request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("secret address and token", { status: 400 })); vi.stubGlobal("fetch", fetcher);
    await expect(sendLoginEmail(approved, token, new Date())).rejects.toThrow("could not send"); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
describe("session access", () => {
  const signIn = (email: string, provider = "brevo") => emailAuthCallbacks.signIn!({ user: { id: "1", email }, account: { provider, type: "email", providerAccountId: email } });
  function session(token: Record<string, unknown>, email = approved) {
    // Auth.js's adapter/JWT session union has an intersected expiry type. This is the JWT shape used by the portal.
    const args = { session: { user: { id: "1", email }, expires: new Date(Date.now() + 1_000).toISOString() }, token };
    return emailAuthCallbacks.session!(args as unknown as Parameters<NonNullable<typeof emailAuthCallbacks.session>>[0]);
  }
  it("allows both emails at request and redemption, without Google profiles", async () => {
    expect(await signIn(approved)).toBe(true); expect(await signIn("u3664746@connect.hku.hk")).toBe(true);
    expect(await signIn("stranger@example.com")).toBe(false); expect(await signIn(approved, "google")).toBe(false);
  });
  it("rejects old Google sessions and sessions older than eight hours", async () => {
    expect((await session({ portalVerified: true })).user?.email).toBeNull();
    expect((await session({ portalAuthMethod: "email-link", portalLoginAt: Date.now() - 8 * 60 * 60 * 1000 })).user?.email).toBeNull();
    expect((await session({ portalAuthMethod: "email-link", portalLoginAt: Date.now() })).user?.email).toBe(approved);
  });
  it("revokes access after an address leaves the allowlist", async () => {
    vi.stubEnv("PORTAL_ALLOWED_EMAILS", "other@example.com,u3664746@connect.hku.hk");
    expect((await session({ portalAuthMethod: "email-link", portalLoginAt: Date.now() })).user?.email).toBeNull();
  });
});
