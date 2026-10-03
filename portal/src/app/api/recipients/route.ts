import { api, contactInput, jsonBody } from "@/lib/api";
import { service } from "@/lib/runtime";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function GET(request: Request) { return api(request, false, () => service().recipients(new URL(request.url).searchParams.get("q")?.slice(0, 150) ?? "")); }
export function POST(request: Request) {
  return api(request, true, async actor => { const body = await jsonBody(request, contactInput); await service().add(actor, body.name, body.email); });
}
