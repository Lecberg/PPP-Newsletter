import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { NextRequest } from "next/server";
import { POST as verifyLink } from "@/app/api/login/verify/route";
import { GET as publicAuth } from "@/app/api/auth/[...nextauth]/route";
import { LoginLimiter } from "@/lib/email-login";
import { handlers } from "@/auth";

describe.skipIf(process.env.PORTAL_LIVE_DATABASE_TESTS !== "true")("live Neon email login", () => {
  let sql: NeonQueryFunction<false, false>, email: string, other: string, key: string, network: string;
  const origin = "https://portal-test.example.com";
  beforeEach(() => {
    sql = neon(process.env.DATABASE_URL!);
    email = `portal-test-${randomUUID()}@example.com`; other = `portal-test-${randomUUID()}@example.com`;
    network = randomUUID();
    for (const [name, value] of Object.entries({ AUTH_URL: origin, PORTAL_ALLOWED_EMAILS: `${email},${other}`, AUTH_EMAIL_SENDER_ID: "1", BREVO_API_KEY: "not-used" })) vi.stubEnv(name, value);
    key = createHmac("sha256", process.env.AUTH_SECRET!).update(`network:${network}`).digest("hex");
  });
  afterEach(async () => {
    const emailKey = createHmac("sha256", process.env.AUTH_SECRET!).update(`email:${email}`).digest("hex");
    await sql.transaction([
      sql`DELETE FROM verification_token WHERE identifier IN (${email}, ${other})`,
      sql`DELETE FROM users WHERE email IN (${email}, ${other})`,
      sql`DELETE FROM portal_login_limits WHERE key IN (${key}, ${emailKey})`
    ]);
    vi.unstubAllEnvs();
  }, 15_000);
  async function insert(address = email, expires = new Date(Date.now() + 600_000)) {
    const token = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(token + process.env.AUTH_SECRET).digest("hex");
    await sql`INSERT INTO verification_token (identifier, token, expires) VALUES (${address}, ${hash}, ${expires.toISOString()})`;
    return token;
  }
  function confirm(address: string, token: string) {
    return verifyLink(new Request(origin + "/api/login/verify", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ email: address, token }) }));
  }
  it("logs in both allowed emails using real Auth.js and database records", async () => {
    for (const address of [email, other]) {
      const token = await insert(address);
      const response = await confirm(address, token);
      expect(response.status).toBe(200); expect(response.headers.get("Set-Cookie")).toContain("authjs.session-token");
      const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
      const session = await handlers.GET(new NextRequest(origin + "/api/auth/session", { headers: { cookie } }));
      expect((await session.json()).user.email).toBe(address);
      expect(await sql`SELECT token FROM verification_token WHERE identifier = ${address}`).toHaveLength(0);
      const [user] = await sql`SELECT "emailVerified" FROM users WHERE email = ${address}`;
      expect(user.emailVerified).toBeTruthy();
    }
  }, 30_000);
  it("logs out a verified session through Auth.js with its anti-forgery check", async () => {
    const response = await confirm(email, await insert());
    const cookies = response.headers.getSetCookie().map(value => value.split(";")[0]);
    const csrf = await handlers.GET(new NextRequest(origin + "/api/auth/csrf", { headers: { cookie: cookies.join("; ") } }));
    const { csrfToken } = await csrf.json();
    cookies.push(...csrf.headers.getSetCookie().map(value => value.split(";")[0]));
    const signout = await handlers.POST(new NextRequest(origin + "/api/auth/signout", {
      method: "POST", headers: { cookie: cookies.join("; "), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken, callbackUrl: origin + "/" })
    }));
    expect(signout.status).toBe(302);
    expect(signout.headers.getSetCookie().some(cookie => cookie.includes("authjs.session-token=") && cookie.includes("Max-Age=0"))).toBe(true);
  }, 30_000);
  it("allows exactly one simultaneous confirmation and refuses later replay", async () => {
    const token = await insert();
    const responses = await Promise.all([confirm(email, token), confirm(email, token)]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 400]);
    expect((await confirm(email, token)).status).toBe(400);
  }, 30_000);
  it("refuses expired tokens and does not consume tokens on scanner GETs", async () => {
    const expired = await insert(email, new Date(Date.now() - 1000));
    expect((await confirm(email, expired)).status).toBe(400);
    const valid = await insert();
    expect((await publicAuth(new NextRequest(`${origin}/api/auth/callback/brevo?email=${email}&token=${valid}`))).status).toBe(404);
    expect(await sql`SELECT token FROM verification_token WHERE identifier = ${email}`).toHaveLength(1);
    expect((await confirm(email, valid)).status).toBe(200);
  }, 30_000);
  it("shares the network cap across independent concurrent database clients", async () => {
    const first = new LoginLimiter(), second = new LoginLimiter();
    const results = await Promise.all(Array.from({ length: 24 }, (_, i) => (i % 2 ? first : second).take("network", network)));
    expect(results.filter(Boolean)).toHaveLength(20);
  }, 30_000);
  it("enforces email cooldown and the hourly cap after cooldown has passed", async () => {
    const first = new LoginLimiter(), second = new LoginLimiter();
    expect(await first.take("email", email)).toBe(true); expect(await second.take("email", email)).toBe(false);
    const emailKey = createHmac("sha256", process.env.AUTH_SECRET!).update(`email:${email}`).digest("hex");
    await sql`UPDATE portal_login_limits SET requests = ARRAY[clock_timestamp()-interval '5 minutes', clock_timestamp()-interval '4 minutes', clock_timestamp()-interval '3 minutes', clock_timestamp()-interval '2 minutes', clock_timestamp()-interval '61 seconds'] WHERE key = ${emailKey}`;
    expect(await first.take("email", email)).toBe(false);
    await sql`UPDATE portal_login_limits SET requests = ARRAY[clock_timestamp()-interval '2 hours'] WHERE key = ${emailKey}`;
    expect(await second.take("email", email)).toBe(true);
  }, 30_000);
});
