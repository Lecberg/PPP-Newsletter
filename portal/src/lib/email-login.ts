import "server-only";
import { createHmac } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { allowEmail, allowedEmails } from "./policy";
import { PortalError } from "./errors";

export const LOGIN_PROVIDER = "brevo";
export const LINK_SECONDS = 600;
export const SESSION_SECONDS = 8 * 60 * 60;
export const loginEmailInput = z.object({ email: z.string().trim().toLowerCase().max(254).pipe(z.email()) }).strict();
export const loginVerifyInput = loginEmailInput.extend({ token: z.string().regex(/^[a-f0-9]{64}$/) });
export const acknowledgement = { message: "If this address has access, a login link will arrive shortly. Check your inbox and spam folder." };

export function loginReady(env: Record<string, string | undefined> = process.env) {
  return allowedEmails(env.PORTAL_ALLOWED_EMAILS).length === 2 && Boolean(env.AUTH_SECRET && env.AUTH_URL && env.DATABASE_URL && env.BREVO_API_KEY)
    && /^[1-9]\d*$/.test(env.AUTH_EMAIL_SENDER_ID ?? "");
}
export function canonicalOrigin(env: Record<string, string | undefined> = process.env) {
  if (!env.AUTH_URL) throw new Error("Login configuration missing");
  const url = new URL(env.AUTH_URL);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && !env.VERCEL && !env.VERCEL_ENV && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Invalid login origin");
  return url.origin;
}
export function loginLink(identifier: string, token: string, env: Record<string, string | undefined> = process.env) {
  return `${canonicalOrigin(env)}/login/verify#${new URLSearchParams({ email: identifier, token })}`;
}
export function requestNetwork(request: Request, env: Record<string, string | undefined> = process.env) {
  // Vercel overwrites this header. Never trust caller-supplied forwarding headers off-platform.
  return env.VERCEL ? (request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || "unknown") : "local";
}
export class LoginLimiter {
  private sql;
  constructor() {
    if (!process.env.DATABASE_URL || !process.env.AUTH_SECRET) throw new Error("Login database unavailable");
    this.sql = neon(process.env.DATABASE_URL);
  }
  async take(kind: "network" | "email", value: string) {
    const key = createHmac("sha256", process.env.AUTH_SECRET!).update(`${kind}:${value}`).digest("hex");
    const maximum = kind === "email" ? 5 : 20;
    const cooldown = kind === "email" ? 60 : 0;
    const rows = await this.sql`
      INSERT INTO portal_login_limits (key, requests) VALUES (${key}, ARRAY[clock_timestamp()])
      ON CONFLICT (key) DO UPDATE SET requests =
        ARRAY(SELECT t FROM unnest(portal_login_limits.requests) AS t WHERE t > clock_timestamp() - interval '1 hour') || ARRAY[clock_timestamp()]
      WHERE cardinality(ARRAY(SELECT t FROM unnest(portal_login_limits.requests) AS t WHERE t > clock_timestamp() - interval '1 hour')) < ${maximum}
        AND portal_login_limits.requests[array_length(portal_login_limits.requests, 1)] <= clock_timestamp() - ${cooldown} * interval '1 second'
      RETURNING key`;
    return rows.length === 1;
  }
}
export async function sendLoginEmail(identifier: string, token: string, expires: Date) {
  if (!loginReady() || !allowEmail(identifier)) throw new Error("Login email unavailable");
  const link = loginLink(identifier, token);
  const preview = Boolean(process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") || !process.env.VERCEL;
  const title = `${preview ? "[Preview] " : ""}Your newsletter portal login link`;
  const until = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", hour: "2-digit", minute: "2-digit", hour12: false }).format(expires);
  const htmlLink = link.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(15_000),
    headers: { "api-key": process.env.BREVO_API_KEY!, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { id: Number(process.env.AUTH_EMAIL_SENDER_ID) }, to: [{ email: identifier }], subject: title,
      htmlContent: `<html><body style="font-family:Arial,sans-serif;color:#10213b"><h1>Sign in to your newsletter portal</h1><p>You requested a login link for Hong Kong PPP Weekly.</p><p><a href="${htmlLink}">Open the portal</a>, then select <strong>Continue to portal</strong>.</p><p>This link works once and expires at ${until} Hong Kong time, in 10 minutes.</p><p>If you did not request this email, you can ignore it.</p></body></html>`,
      textContent: `Sign in to Hong Kong PPP Weekly:\n${link}\n\nThen select Continue to portal. This link works once and expires in 10 minutes (${until} Hong Kong time). If you did not request it, ignore this email.`
    })
  });
  // Provider bodies may contain addresses or tokens. Never include them in errors or logs.
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const code = typeof body.code === "string" && /^[a-z_]{1,50}$/.test(body.code) ? body.code : "unavailable";
    const message = String(body.message ?? "");
    const reason = /\bip\b|ip address|whitelist|authori[sz]ed ip/i.test(message) ? "server-network-blocked"
      : /key.*not found|invalid.*key|key.*invalid|missing.*key/i.test(message) ? "key-not-recognized"
      : /not verified|activat/i.test(message) ? "email-service-not-verified" : "provider-rejected-request";
    console.error("Login email rejected:", response.status, code, reason);
    throw new PortalError(503, "We could not send a login link. Please try again shortly.");
  }
}
