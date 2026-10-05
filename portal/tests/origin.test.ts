import { describe, expect, it } from "vitest";
import { checkMutationOrigin } from "@/lib/origin";

describe("mutation request origins", () => {
  const production = { NODE_ENV: "production", VERCEL: "1", AUTH_URL: "https://ppp-newsletter-portal.vercel.app" };
  const request = (origin: string, host = "ppp-newsletter-portal.vercel.app", contentType = "application/json") => new Request("http://localhost:3000/api/recipients", { method: "POST", headers: { origin, host, "content-type": contentType } });
  it("accepts the configured production origin despite internal request URLs", () => { expect(() => checkMutationOrigin(request(production.AUTH_URL), production)).not.toThrow(); });
  it("rejects outside origins and forged host headers in production", () => {
    expect(() => checkMutationOrigin(request("https://evil.example", "evil.example"), production)).toThrow("portal");
    expect(() => checkMutationOrigin(request("http://127.0.0.1:3000", "127.0.0.1:3000"), production)).toThrow("portal");
  });
  it("rejects absent origins and non-JSON mutation requests", () => {
    expect(() => checkMutationOrigin(new Request("https://portal.example"), production)).toThrow("portal");
    expect(() => checkMutationOrigin(request(production.AUTH_URL, undefined, "text/plain"), production)).toThrow("JSON");
  });
  it("permits an explicit loopback development host", () => { expect(() => checkMutationOrigin(request("http://127.0.0.1:3000", "127.0.0.1:3000"), { NODE_ENV: "development", AUTH_URL: "http://localhost:3000" })).not.toThrow(); });
  it("does not enable the development exception on preview deployments", () => { expect(() => checkMutationOrigin(request("http://127.0.0.1:3000", "127.0.0.1:3000"), { NODE_ENV: "development", VERCEL_ENV: "preview", AUTH_URL: production.AUTH_URL })).toThrow("portal"); });
});
