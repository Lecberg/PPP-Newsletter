import { signIn } from "@/auth";
import { jsonBody } from "@/lib/api";
import { acknowledgement, canonicalOrigin, LOGIN_PROVIDER, loginEmailInput, LoginLimiter, loginReady, requestNetwork } from "@/lib/email-login";
import { loginReply, loginRequest } from "@/lib/login-http";
import { allowEmail } from "@/lib/policy";
import { PortalError } from "@/lib/errors";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return loginRequest(request, async () => {
    const { email } = await jsonBody(request, loginEmailInput);
    if (!loginReady()) throw new PortalError(503, "The owner is finishing login setup. Please check back later.");
    const limits = new LoginLimiter();
    if (!await limits.take("network", requestNetwork(request)) || !allowEmail(email) || !await limits.take("email", email)) return loginReply(acknowledgement, 202);
    const result = await signIn(LOGIN_PROVIDER, { email, redirect: false, redirectTo: `${canonicalOrigin()}/` });
    if (!result || new URL(result, canonicalOrigin()).searchParams.has("error")) throw new PortalError(503, "We could not send a login link. Please try again shortly.");
    return loginReply(acknowledgement, 202);
  });
}
