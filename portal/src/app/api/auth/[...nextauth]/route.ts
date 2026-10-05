import { handlers } from "@/auth";
import { NextRequest } from "next/server";
import { blockNativeLogin, loginReply } from "@/lib/login-http";
export const dynamic = "force-dynamic";
async function handle(request: NextRequest, method: "GET" | "POST") {
  // Only the origin-checked login routes can issue or consume email links.
  if (blockNativeLogin(request)) return loginReply({ error: "Use the portal login page." }, 404);
  const response = await handlers[method](request);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const GET = (request: NextRequest) => handle(request, "GET");
export const POST = (request: NextRequest) => handle(request, "POST");
