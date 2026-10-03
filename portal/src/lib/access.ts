import "server-only";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { PortalError } from "./errors";
import { allowedEmails, isDemo } from "./policy";
import { checkMutationOrigin } from "./origin";

export async function requireUser() {
  if (isDemo()) {
    const host = (await headers()).get("host") ?? "";
    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return "owner@example.com";
  }
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email || !allowedEmails().includes(email)) throw new PortalError(401, "Sign in with an approved Google account.");
  return email;
}
export function requireSameOrigin(request: Request) {
  checkMutationOrigin(request);
}
