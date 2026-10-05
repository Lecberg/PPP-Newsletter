import { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { jsonBody } from "@/lib/api";
import { canonicalOrigin, LOGIN_PROVIDER, loginVerifyInput, loginReady } from "@/lib/email-login";
import { loginReply, loginRequest } from "@/lib/login-http";
import { allowEmail } from "@/lib/policy";
import { PortalError } from "@/lib/errors";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return loginRequest(request, async () => {
    const { email, token } = await jsonBody(request, loginVerifyInput);
    if (!loginReady()) throw new PortalError(503, "Login is temporarily unavailable. Please try again shortly.");
    if (!allowEmail(email)) throw new PortalError(400, "This login link is invalid or has expired. Please request a new one.");
    const origin = canonicalOrigin();
    const callback = new URL(`/api/auth/callback/${LOGIN_PROVIDER}`, origin);
    callback.search = new URLSearchParams({ email, token, callbackUrl: `${origin}/` }).toString();
    // Call Auth.js inside this request. Never redirect the browser to a URL containing a token.
    const result = await handlers.GET(new NextRequest(callback, { headers: { cookie: request.headers.get("cookie") ?? "" } }));
    const cookies = result.headers.getSetCookie();
    if (!cookies.some(cookie => /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?=/.test(cookie) && !cookie.includes("Max-Age=0"))) {
      throw new PortalError(400, "This login link is invalid or has expired. Please request a new one.");
    }
    const response = loginReply({ redirectTo: "/" });
    for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
    return response;
  });
}
