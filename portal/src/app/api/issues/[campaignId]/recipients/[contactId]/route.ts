import { api, jsonBody, parseId, selectionInput } from "@/lib/api";
import { service } from "@/lib/runtime";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ campaignId: string; contactId: string }> }) {
  return api(request, true, async actor => {
    const params = await context.params, body = await jsonBody(request, selectionInput);
    return service().chooseRecipient(actor, parseId(params.campaignId), parseId(params.contactId), body.included, body.revision);
  });
}
