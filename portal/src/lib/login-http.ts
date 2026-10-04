import "server-only";
import { NextResponse } from "next/server";
import { checkMutationOrigin } from "./origin";
import { PortalError } from "./errors";

export function loginReply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
export async function loginRequest(request: Request, work: () => Promise<Response>) {
  try {
    checkMutationOrigin(request);
    return await work();
  } catch (error) {
    // Do not log a request, callback URL, provider body, or error cause.
    return loginReply({ error: error instanceof PortalError ? error.message : "We could not complete login. Please request a new link shortly." }, error instanceof PortalError ? error.status : 503);
  }
}
export function blockNativeLogin(request: Request) {
  return /\/api\/auth\/(signin|callback)\/[^/]+/.test(new URL(request.url).pathname);
}
