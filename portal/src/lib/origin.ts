import { PortalError } from "./errors";

export function checkMutationOrigin(request: Request, env: Record<string, string | undefined> = process.env) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  let expectedOrigin = env.AUTH_URL ? new URL(env.AUTH_URL).origin : url.origin;
  // Next dev normalizes request.url to localhost, even when the browser uses 127.0.0.1.
  // Only local development may derive its origin from an explicit loopback Host.
  const host = request.headers.get("host") ?? "";
  if (env.NODE_ENV !== "production" && !env.VERCEL && !env.VERCEL_ENV && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
    expectedOrigin = `${url.protocol}//${host}`;
  }
  if (!origin || origin !== expectedOrigin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new PortalError(403, "This request must come from the portal.");
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new PortalError(415, "Use a JSON request.");
}
