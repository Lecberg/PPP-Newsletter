import "server-only";
import { BrevoClient } from "./brevo";
import { SheetsClient } from "./sheets";
import { NeonStore } from "./store";
import { PortalService } from "./service";
import { deliveryPolicy, isDemo } from "./policy";
import { DemoBrevo, DemoSheets, MemoryStore } from "./demo";

const globalDemo = globalThis as typeof globalThis & { newsletterDemoService?: PortalService };
export function service() {
  if (isDemo()) {
    globalDemo.newsletterDemoService ??= new PortalService(new DemoBrevo(), new DemoSheets(), new MemoryStore(), { listId: 999, enabled: true, reason: null });
    return globalDemo.newsletterDemoService;
  }
  return new PortalService(new BrevoClient(), new SheetsClient(), new NeonStore(), deliveryPolicy());
}
