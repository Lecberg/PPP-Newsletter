import { api, parseId } from "@/lib/api";
import { service } from "@/lib/runtime";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ campaignId: string }> }) {
  return api(request, false, async () => service().issueRecipients(parseId((await context.params).campaignId)));
}
