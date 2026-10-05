import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSameOrigin, requireUser } from "./access";
import { BrevoError, PortalError } from "./errors";

export const contactInput = z.object({ name: z.string().trim().min(1, "Enter a name.").max(150), email: z.email("Enter a valid email address.").trim().toLowerCase().max(254) }).strict();
export const sendInput = z.object({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const selectionInput = z.object({ included: z.boolean(), revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict();
export function parseId(value: string) {
  const id = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id < 1) throw new PortalError(400, "Invalid contact or campaign number.");
  return id;
}
export async function jsonBody<T>(request: Request, schema: z.ZodType<T>, limit = 4096) {
  // Bound raw text too: content-length can be absent or dishonest.
  const raw = await request.text();
  if (raw.length > limit) throw new PortalError(413, "This request is too large.");
  let data;
  try { data = JSON.parse(raw); } catch { throw new PortalError(400, "The request could not be read."); }
  const result = schema.safeParse(data);
  if (!result.success) throw new PortalError(400, result.error.issues[0]?.message ?? "Check the entered details.");
  return result.data;
}
export async function api(request: Request, mutate: boolean, work: (actor: string) => Promise<unknown>) {
  try {
    const actor = await requireUser();
    if (mutate) requireSameOrigin(request);
    const result = await work(actor);
    return NextResponse.json(result ?? { ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const known = error instanceof PortalError || error instanceof BrevoError;
    if (!known) console.error("Portal operation failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: known ? error.message : "The portal could not complete this operation. Refresh its status before trying again." }, {
      status: error instanceof PortalError ? error.status : error instanceof BrevoError ? 502 : 503,
      headers: { "Cache-Control": "private, no-store" }
    });
  }
}
