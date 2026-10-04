import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrevoClient } from "@/lib/brevo";

describe("Brevo HTTP integration", () => {
  let client: BrevoClient;
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); vi.stubEnv("BREVO_API_KEY", "test-key"); client = new BrevoClient(); });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  it("handles the campaign report's real targeting field names", async () => {
    fetchMock.mockResolvedValue(json({ id: 12, subject: "Draft", htmlContent: "<p>Draft</p>", status: "draft", recipients: { lists: [5], exclusionLists: [], segments: [], excludedSegments: [] } }));
    expect(await client.campaign(12)).toMatchObject({ recipients: { lists: [5] } });
  });
  it("loads all pages of the configured list", async () => {
    fetchMock.mockResolvedValueOnce(json({ contacts: Array.from({ length: 500 }, (_, i) => ({ id: i + 1 })), count: 501 }))
      .mockResolvedValueOnce(json({ contacts: [{ id: 501 }], count: 501 }));
    expect(await client.contacts(5)).toHaveLength(501);
    expect(fetchMock.mock.calls[1][0]).toContain("lists/5/contacts?limit=500&offset=500");
  });
  it("omits EMAIL and suppression flags for name-only edits", async () => {
    fetchMock.mockResolvedValueOnce(json({ attributes: [{ name: "NEWSLETTER_NAME", type: "text", category: "normal" }] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await client.update(7, "New Name", "");
    const request = fetchMock.mock.calls[1];
    expect(request[1].method).toBe("PUT");
    expect(JSON.parse(request[1].body)).toEqual({ attributes: { NEWSLETTER_NAME: "New Name" } });
  });
  it("uses list removal without deleting the contact", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await client.remove(5, 7);
    expect(fetchMock.mock.calls[0][0]).toMatch(/contacts\/lists\/5\/contacts\/remove$/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ ids: [7] }) });
  });
  it("recognizes a successful send without a response body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(client.send(12)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toMatch(/emailCampaigns\/12\/sendNow$/);
  });
  it.each([400, 402, 404, 429])("classifies HTTP %s as a definite rejected request", async status => {
    fetchMock.mockResolvedValue(json({}, status));
    await expect(client.send(12)).rejects.toMatchObject({ status, definite: true });
  });
  it.each([408, 500, 503])("keeps HTTP %s outcomes uncertain", async status => {
    fetchMock.mockResolvedValue(json({}, status));
    await expect(client.send(12)).rejects.toMatchObject({ status, definite: false });
  });
  it("does not retry a timed-out send", async () => {
    fetchMock.mockRejectedValue(new Error("Network timeout"));
    await expect(client.send(12)).rejects.toMatchObject({ definite: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("updates only campaign targeting, preserving the original list", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await client.target(13, 5, 10);
    expect(fetchMock.mock.calls[0][0]).toMatch(/emailCampaigns\/13$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ recipients: { listIds: [5], exclusionListIds: [10] } });
  });
  it("uses existing contacts only and checks exclusion membership after updates", async () => {
    fetchMock.mockResolvedValueOnce(json({ contacts: [{ id: 7 }, { id: 8 }] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({ contacts: [{ id: 7 }, { id: 9 }] }));
    await client.setExcludedContacts(10, [7, 9]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ ids: [8] });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ ids: [9] });
    expect(fetchMock.mock.calls.every(([url]) => url.includes('/contacts/lists/10/'))).toBe(true);
  });
  it("refuses partial exclusion updates instead of sending to unchecked recipients", async () => {
    fetchMock.mockResolvedValueOnce(json({ contacts: [] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({ contacts: [] }));
    await expect(client.setExcludedContacts(10, [7])).rejects.toThrow("not confirmed");
  });
  it("creates a private campaign exclusion list in the configured list's folder", async () => {
    fetchMock.mockResolvedValueOnce(json({ folderId: 2 })).mockResolvedValueOnce(json({ id: 10 }, 201));
    expect(await client.createExclusionList(5, 13)).toBe(10);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ folderId: 2, name: expect.stringContaining('PPP portal exclusions 5-13-') });
  });
});
