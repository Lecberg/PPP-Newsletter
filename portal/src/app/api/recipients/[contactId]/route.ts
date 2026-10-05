import { api, contactInput, jsonBody, parseId } from "@/lib/api";
import { service } from "@/lib/runtime";
export const maxDuration = 60;
type Context = { params: Promise<{ contactId: string }> };
export function PATCH(request: Request, context: Context) {
  return api(request, true, async actor => {
    const body = await jsonBody(request, contactInput);
    await service().update(actor, parseId((await context.params).contactId), body.name, body.email);
  });
}
export function DELETE(request: Request, context: Context) {
  return api(request, true, async actor => service().remove(actor, parseId((await context.params).contactId)));
}
