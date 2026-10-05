import { api, jsonBody } from "@/lib/api";
import { SettingsService, settingsInput } from "@/lib/settings";
export const dynamic = "force-dynamic";
export async function GET(request:Request) { return api(request,false,()=>new SettingsService().get()); }
export async function PUT(request:Request) { return api(request,true,async actor=>new SettingsService().save(actor,await jsonBody(request,settingsInput,256000))); }
