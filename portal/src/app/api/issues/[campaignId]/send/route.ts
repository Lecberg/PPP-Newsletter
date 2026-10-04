import { api, jsonBody, parseId, sendInput } from "@/lib/api";
import { service } from "@/lib/runtime";
export const maxDuration = 300;
export function POST(request: Request, context: { params: Promise<{ campaignId: string }> }) {
  return api(request, true, async actor => {
    const id = parseId((await context.params).campaignId);
    const body = await jsonBody(request, sendInput);
    return service().send(actor, id, body.fingerprint);
  });
}
