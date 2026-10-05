"use client";
import { useEffect, useRef, useState } from "react";

export function EmailLinkConfirmation() {
  const details = useRef<{ email: string; token: string } | null>(null);
  const initialized = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const email = params.get("email"), token = params.get("token");
    // Remove the secret from browser history. Keep it only in this component's memory.
    window.history.replaceState(null, "", window.location.pathname);
    if (email && token && /^[a-f0-9]{64}$/.test(token)) { details.current = { email, token }; setReady(true); }
    else setError("This login link is incomplete. Please request a new one.");
  }, []);
  async function confirm() {
    if (busy || !details.current) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/login/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(details.current), cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "This link could not be verified. Please request a new one.");
      details.current = null;
      window.location.replace("/");
    } catch (cause) {
      details.current = null; setReady(false);
      setError(cause instanceof Error ? cause.message : "Login could not be confirmed. Please request a new link.");
      setBusy(false);
    }
  }
  return <div className="email-login-form">
    <p>Select Continue to confirm your login. Opening this page alone does not use your link.</p>
    <button className="button primary full-width" onClick={confirm} disabled={!ready || busy}>{busy ? "Confirming login…" : "Continue to portal"}</button>
    {error && <p className="notice error" role="alert">{error}</p>}
    <p className="login-footnote"><a href="/login">Request a new login link</a></p>
  </div>;
}
