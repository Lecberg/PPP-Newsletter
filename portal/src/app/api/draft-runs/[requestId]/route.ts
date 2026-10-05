import { z } from "zod";
import { api } from "@/lib/api";
import { DraftService } from "@/lib/drafts";
import { PortalError } from "@/lib/errors";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{requestId:string}>}) { return api(request,false,async()=>{const {requestId}=await context.params;if(!z.uuid().safeParse(requestId).success)throw new PortalError(400,"Invalid draft request number.");return new DraftService().detail(requestId);}); }
