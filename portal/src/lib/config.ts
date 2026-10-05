import "server-only";
import { PortalError } from "./errors";
export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new PortalError(503, "The site owner needs to finish the portal setup.");
  return value;
}
