// Messages are hints only. The original tab checks its server session before opening the portal.
const channelName = "ppp-email-login-v1";
const storageKey = "ppp-email-login-event-v1";
type LoginEvent = "verified" | "original-ready";

function loginEvents(receive: (event: LoginEvent) => void) {
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(channelName);
    channel.onmessage = event => {
      if (event.data === "verified" || event.data === "original-ready") receive(event.data);
    };
  } catch { /* Session checks still work when cross-tab messages are unavailable. */ }
  function storage(event: StorageEvent) {
    if (event.key !== storageKey || !event.newValue) return;
    const type = event.newValue.split(":")[0];
    if (type === "verified" || type === "original-ready") receive(type);
  }
  window.addEventListener("storage", storage);
  return {
    send(event: LoginEvent) {
      try { channel?.postMessage(event); } catch { /* Try the storage fallback. */ }
      try {
        // No address, link, token, or session cookie is shared or saved here.
        window.localStorage.setItem(storageKey, `${event}:${crypto.randomUUID()}`);
        window.localStorage.removeItem(storageKey);
      } catch { /* Private browsing may disable storage. */ }
    },
    close() { channel?.close(); window.removeEventListener("storage", storage); }
  };
}

export function watchEmailLogin(email: string, openPortal: () => void) {
  let stopped = false, checking = false;
  const events = loginEvents(event => { if (event === "verified") void check(); });
  async function check() {
    if (stopped || checking) return;
    checking = true;
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return;
      const session = await response.json();
      if (stopped || session?.user?.email?.toLowerCase() !== email.trim().toLowerCase()) return;
      events.send("original-ready");
      stop();
      openPortal();
    } catch { /* A later message, focus, or timer retries the session check. */ }
    finally { checking = false; }
  }
  const timer = window.setInterval(() => { void check(); }, 5000);
  const expiry = window.setTimeout(stop, 10 * 60 * 1000);
  const focus = () => { void check(); };
  const visible = () => { if (document.visibilityState === "visible") void check(); };
  window.addEventListener("focus", focus);
  document.addEventListener("visibilitychange", visible);
  function stop() {
    stopped = true;
    window.clearInterval(timer); window.clearTimeout(expiry);
    window.removeEventListener("focus", focus);
    document.removeEventListener("visibilitychange", visible);
    events.close();
  }
  void check();
  return stop;
}

export function prepareLoginReturn() {
  let ready = false;
  let resolve: ((returned: boolean) => void) | undefined;
  let timer: number | undefined;
  const events = loginEvents(event => {
    if (event === "original-ready") { ready = true; resolve?.(true); }
  });
  return {
    complete() {
      return new Promise<boolean>(done => {
        resolve = done;
        events.send("verified");
        if (ready) done(true);
        else timer = window.setTimeout(() => done(false), 2500);
      });
    },
    close() { window.clearTimeout(timer); events.close(); }
  };
}
