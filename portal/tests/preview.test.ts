import { describe, expect, it } from "vitest";
import { isolatedPreview } from "@/lib/preview";
describe("isolated email preview", () => {
  it("preserves the existing doctype and styles while adding the restrictive policy first", () => {
    const html = '<!doctype html><html><head><style>body { color: navy; }</style></head><body>中文 news</body></html>';
    const preview = isolatedPreview(html);
    expect(preview.startsWith("<!doctype html>")).toBe(true);
    expect(preview.indexOf('Content-Security-Policy')).toBeLessThan(preview.indexOf('<style>'));
    expect(preview).toContain('body { color: navy; }'); expect(preview).toContain('中文 news');
    expect(preview).toContain("default-src 'none'");
  });
  it("adds a document wrapper for fragment-only emails", () => {
    expect(isolatedPreview('<p>Draft</p>')).toMatch(/^<!doctype html>/);
    expect(isolatedPreview('<p>Draft</p>')).toContain('<body><p>Draft</p></body>');
  });
});
