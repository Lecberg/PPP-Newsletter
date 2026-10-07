import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareLoginReturn, watchEmailLogin } from "@/lib/login-tabs";

const email = "owner@example.com";
let windowEvents: EventTarget, documentEvents: EventTarget;
let fetcher: ReturnType<typeof vi.fn>;
let storage: { setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> };
class Channel {
  static all: Channel[] = [];
  static sent: unknown[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  closed = false;
  constructor(readonly name: string) { Channel.all.push(this); }
  postMessage(data: unknown) {
    Channel.sent.push(data);
    for (const channel of Channel.all) {
      if (channel !== this && !channel.closed && channel.name === this.name) channel.onmessage?.({ data });
    }
  }
  close() { this.closed = true; }
}
function send(data: unknown) {
  const channel = new Channel("ppp-email-login-v1"); channel.postMessage(data); channel.close();
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

beforeEach(() => {
  vi.useFakeTimers();
  windowEvents = new EventTarget(); documentEvents = new EventTarget();
  storage = { setItem: vi.fn(), removeItem: vi.fn() };
  vi.stubGlobal("window", {
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    setInterval, clearInterval, setTimeout, clearTimeout, localStorage: storage
  });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    removeEventListener: documentEvents.removeEventListener.bind(documentEvents)
  });
  Channel.all = []; Channel.sent = [];
  vi.stubGlobal("BroadcastChannel", Channel);
  fetcher = vi.fn().mockImplementation(async () => Response.json({}));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("original login tab", () => {
  it("never opens the portal based on a message without a verified server session", async () => {
    const open = vi.fn(); const stop = watchEmailLogin(email, open);
    await flush(); send("verified"); await flush();
    expect(open).not.toHaveBeenCalled();
    expect(fetcher.mock.calls[0][0]).toBe("/api/auth/session");
    expect(Channel.sent).not.toContain("original-ready"); stop();
  });
  it("opens once for the requested account and acknowledges the original tab", async () => {
    const open = vi.fn(); watchEmailLogin(" OWNER@example.com ", open);
    await flush();
    fetcher.mockResolvedValue(Response.json({ user: { email } }));
    send("verified"); await flush(); send("verified"); await flush();
    expect(open).toHaveBeenCalledTimes(1);
    expect(Channel.sent).toContain("original-ready");
    expect(JSON.stringify(storage.setItem.mock.calls)).not.toContain(email);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not switch the original tab into a different account", async () => {
    fetcher.mockResolvedValue(Response.json({ user: { email: "someone@example.com" } }));
    const open = vi.fn(); const stop = watchEmailLogin(email, open);
    await flush(); send("verified"); await flush();
    expect(open).not.toHaveBeenCalled(); stop();
  });
  it("recovers through polling when messaging and browser storage are unavailable", async () => {
    vi.stubGlobal("BroadcastChannel", class { constructor() { throw new Error("unsupported"); } });
    storage.setItem.mockImplementation(() => { throw new Error("storage disabled"); });
    const open = vi.fn(); watchEmailLogin(email, open); await flush();
    fetcher.mockResolvedValue(Response.json({ user: { email } }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(open).toHaveBeenCalledTimes(1);
  });
  it("checks promptly when the user returns to the original tab", async () => {
    const open = vi.fn(); watchEmailLogin(email, open); await flush();
    fetcher.mockResolvedValue(Response.json({ user: { email } }));
    windowEvents.dispatchEvent(new Event("focus")); await flush();
    expect(open).toHaveBeenCalledTimes(1);
  });
  it("retries a temporary session error without consuming another email link", async () => {
    fetcher.mockRejectedValueOnce(new Error("offline"));
    const open = vi.fn(); watchEmailLogin(email, open); await flush();
    fetcher.mockResolvedValue(Response.json({ user: { email } }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(open).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.every(([url]) => url === "/api/auth/session")).toBe(true);
  });
  it("stops checking when the link expires", async () => {
    const open = vi.fn(); watchEmailLogin(email, open);
    await vi.advanceTimersByTimeAsync(600000);
    fetcher.mockResolvedValue(Response.json({ user: { email } }));
    send("verified"); windowEvents.dispatchEvent(new Event("focus")); await flush();
    expect(open).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("ignores a session response that arrives after the form has stopped waiting", async () => {
    let finish!: (value: Response) => void;
    fetcher.mockReturnValue(new Promise<Response>(resolve => { finish = resolve; }));
    const open = vi.fn(); const stop = watchEmailLogin(email, open);
    stop(); finish(Response.json({ user: { email } })); await flush();
    expect(open).not.toHaveBeenCalled();
  });
  it("uses storage events as a fallback without trusting unrelated events", async () => {
    const open = vi.fn(); const stop = watchEmailLogin(email, open); await flush();
    fetcher.mockResolvedValue(Response.json({ user: { email } }));
    const unrelated = Object.assign(new Event("storage"), { key: "other", newValue: "verified:123" });
    windowEvents.dispatchEvent(unrelated); await flush(); expect(open).not.toHaveBeenCalled();
    const verified = Object.assign(new Event("storage"), { key: "ppp-email-login-event-v1", newValue: "verified:123" });
    windowEvents.dispatchEvent(verified); await flush(); expect(open).toHaveBeenCalledTimes(1); stop();
  });
});

describe("email verification tab", () => {
  it("returns to the original tab only after that tab confirms its session", async () => {
    const open = vi.fn(); watchEmailLogin(email, open); await flush();
    const handoff = prepareLoginReturn();
    fetcher.mockResolvedValue(Response.json({ user: { email } }));
    await expect(handoff.complete()).resolves.toBe(true);
    expect(open).toHaveBeenCalledTimes(1); handoff.close();
  });
  it("falls back to the email tab when the original tab is closed or in another browser", async () => {
    const handoff = prepareLoginReturn(); const result = handoff.complete();
    await vi.advanceTimersByTimeAsync(2500);
    await expect(result).resolves.toBe(false); handoff.close();
  });
  it("handles an acknowledgement during the verification response", async () => {
    const handoff = prepareLoginReturn(); send("original-ready");
    await expect(handoff.complete()).resolves.toBe(true); handoff.close();
  });
});
