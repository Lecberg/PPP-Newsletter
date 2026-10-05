import { z } from "zod";
import { api, jsonBody } from "@/lib/api";
import { DraftService } from "@/lib/drafts";
export const dynamic="force-dynamic";
const input=z.object({requestId:z.uuid()}).strict();
export async function GET(request:Request) { return api(request,false,()=>new DraftService().overview()); }
export async function POST(request:Request) { return api(request,true,async actor=>new DraftService().create(actor,(await jsonBody(request,input)).requestId)); }
