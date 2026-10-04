"use client";
import { useEffect, useState, type FormEvent } from "react";

export function EmailLoginForm({ ready }: { ready: boolean }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!remaining) return;
    const timer = setTimeout(() => setRemaining(remaining - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || remaining) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/login/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }), cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "We could not send a link. Please try again shortly.");
      setMessage(body.message); setRemaining(60);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We could not send a link. Please try again shortly."); }
    finally { setBusy(false); }
  }
  return <form className="email-login-form" onSubmit={submit}>
    <label htmlFor="login-email">Email address</label>
    <input id="login-email" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy || !ready} placeholder="you@example.com" />
    <button className="button primary full-width" disabled={!ready || busy || remaining > 0}>{busy ? "Sending link…" : remaining ? `Send again in ${remaining}s` : "Send login link"}</button>
    {message && <p className="notice success" role="status">{message}</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    <p className="login-footnote">Your link works once and expires in 10 minutes. No password needed.</p>
  </form>;
}
