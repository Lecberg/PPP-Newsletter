import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { isDemo } from "@/lib/policy";
import { Portal } from "@/components/portal";
export const dynamic = "force-dynamic";
export default async function Home() {
  let email: string;
  try { email = await requireUser(); } catch { redirect("/login"); }
  return <Portal email={email} demo={isDemo()} />;
}
