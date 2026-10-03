import { api } from "@/lib/api";
import { service } from "@/lib/runtime";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return api(request, false, () => service().issues()); }
