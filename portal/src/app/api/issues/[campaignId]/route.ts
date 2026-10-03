import { api, parseId } from "@/lib/api";
import { service } from "@/lib/runtime";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request, context: { params: Promise<{ campaignId: string }> }) {
  return api(request, false, async () => service().issue(parseId((await context.params).campaignId)));
}
