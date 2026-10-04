"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import { approvalDate, issueDate, statusLabel } from "@/lib/display";
import { isolatedPreview } from "@/lib/preview";
import type { IssueDetail, IssueRecipients, IssueRow, Recipient } from "@/lib/types";

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, { method, cache: "no-store", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await response.json();
  if (response.status === 401) { window.location.assign("/login"); throw new Error("Please sign in again."); }
  if (!response.ok) throw new Error(value.error ?? "The request could not be completed.");
  return value;
}
function Notice({ message, error = false }: { message: string; error?: boolean }) { return <div className={`notice ${error ? "error" : "success"}`} role={error ? "alert" : "status"}>{message}</div>; }
function Dialog({ title, children, close, busy = false }: { title: string; children: ReactNode; close: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current; el?.showModal(); return () => { el?.close(); }; }, []);
  return <dialog ref={ref} className="dialog" aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <h2 id="dialog-title">{title}</h2>{children}
  </dialog>;
}

export function Portal({ email, demo }: { email: string; demo: boolean }) {
  const [tab, setTab] = useState<"newsletter" | "recipients">("newsletter");
  const [campaignId, setCampaignId] = useState<number | null>(null);
  return <>
    <header className="site-header"><a className="brand" href="/">Hong Kong PPP Weekly</a>
      <nav aria-label="Portal"><button className={tab === "newsletter" ? "active" : ""} aria-current={tab === "newsletter" ? "page" : undefined} onClick={() => setTab("newsletter")}>Newsletter</button><button className={tab === "recipients" ? "active" : ""} aria-current={tab === "recipients" ? "page" : undefined} onClick={() => setTab("recipients")}>Recipients</button></nav>
      <button className="text-button sign-out" title={`Signed in as ${email}`} onClick={() => signOut({ redirectTo: "/login" })}>Sign out</button>
    </header>
    <main className="page">{tab === "newsletter" ? <Newsletter manageRecipients={() => setTab("recipients")} demo={demo} campaignId={campaignId} onCampaignChange={setCampaignId} /> : <Recipients campaignId={campaignId} onCampaignChange={setCampaignId} />}</main>
    {demo && <div className="demo-banner" role="status">Local demonstration · sample content and contacts · delivery is simulated</div>}
    <footer className="site-footer"><span>Hong Kong PPP Weekly</span><span>{email}</span></footer>
  </>;
}

function Newsletter({ manageRecipients, demo, campaignId, onCampaignChange }: { manageRecipients: () => void; demo: boolean; campaignId: number | null; onCampaignChange: (id: number | null) => void }) {
  const [issues, setIssues] = useState<IssueRow[]>([]), [issue, setIssue] = useState<IssueDetail | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null), [history, setHistory] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false);
  const loadSequence = useRef(0);
  async function load(id?: number, refreshHistory = false) {
    const sequence = ++loadSequence.current;
    setLoading(true); setError("");
    try {
      const rows = refreshHistory || !issues.length ? await request<IssueRow[]>("/api/issues") : issues;
      const chosen = id ?? rows[0]?.campaignId;
      const detail = chosen ? await request<IssueDetail>(`/api/issues/${chosen}`) : null;
      if (loadSequence.current !== sequence) return;
      setIssues(rows.map(row => row.campaignId === detail?.campaignId ? { ...row, status: detail.status } : row)); setActiveId(chosen ?? null); setIssue(detail); onCampaignChange(chosen ?? null);
    } catch (e) { if (loadSequence.current === sequence) { setError((e as Error).message); setIssue(null); } }
    finally { if (loadSequence.current === sequence) setLoading(false); }
  }
  useEffect(() => { void load(campaignId ?? undefined); return () => { loadSequence.current++; }; }, []);
  async function send() {
    if (!issue || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await request<{ message: string }>(`/api/issues/${issue.campaignId}/send`, "POST", { fingerprint: issue.fingerprint });
      setMessage(demo ? "Demo delivery submitted. No real email was sent." : result.message);
      setConfirm(false); await load(issue.campaignId);
    } catch (e) { setError((e as Error).message); setConfirm(false); await load(issue.campaignId); setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-heading"><div><h1>Review newsletter</h1><p>Read the draft, check recipients, then confirm delivery.</p></div><button className="text-button refresh" onClick={() => load(activeId ?? undefined, true)} disabled={loading || busy}>Refresh status</button></div>
    {error && <Notice message={error} error />}{message && <Notice message={message} />}
    {loading && <div className="loading" role="status">Loading newsletter…</div>}
    {!loading && !issue && !error && <div className="empty-state"><h2>Your next issue will appear here.</h2><p>Once the newsletter process creates a Brevo draft, you can review it and confirm delivery.</p></div>}
    {issue && !loading && <>
      <div className="issue-bar"><strong>{issue.campaignId === issues[0]?.campaignId ? issue.status === "draft" ? "Latest draft" : "Latest issue" : "Previous issue"} — {issueDate(issue.date)}</strong><button className="text-button underline" aria-expanded={history} onClick={() => setHistory(!history)}>Previous issues</button></div>
      {history && <div className="history-list" aria-label="Previous issues">{issues.map(row => <button key={row.campaignId} className={row.campaignId === activeId ? "selected" : ""} onClick={() => { setHistory(false); setMessage(""); void load(row.campaignId); }}><span>{row.subject}{row.status && <small> · {statusLabel(row.status)}</small>}</span><time>{issueDate(row.date)}</time></button>)}</div>}
      <div className="review-layout"><section className="email-preview" aria-label="Newsletter draft"><iframe key={issue.fingerprint} title="Newsletter preview" sandbox="" referrerPolicy="no-referrer" srcDoc={isolatedPreview(issue.html)} /></section>
        <aside className="delivery-panel"><h2>Delivery details</h2>
          <div className="detail-section"><h3>Subject</h3><p>{issue.subject}</p></div>
          <div className="detail-section"><h3>Recipients</h3><div className="recipient-summary"><span>{issue.eligibleCount} selected {issue.eligibleCount === 1 ? "recipient" : "recipients"}</span><button className="text-button underline" onClick={manageRecipients}>Choose recipients</button></div>{issue.recipientCount !== issue.eligibleCount && <p className="muted small">Unsubscribed and unselected recipients are excluded.</p>}</div>
          <div className="detail-section status-section"><h3>Status</h3><p className={issue.status === "sent" ? "sent" : ""}>{statusLabel(issue.status)}</p></div>
          <button className="button primary full-width" disabled={!issue.canSend || busy} onClick={() => setConfirm(true)}>Confirm delivery</button>
          <p className="delivery-note">{issue.sendDisabledReason ?? "Nothing is sent until you confirm."}</p>
          {issue.approval && <div className="approval-note">Approved by {issue.approval.approvedBy}<br />{approvalDate(issue.approval.approvedAt)}</div>}
        </aside>
      </div>
    </>}
    {confirm && issue && <Dialog title="Confirm delivery" busy={busy} close={() => setConfirm(false)}><p>This will submit the newsletter for immediate delivery.</p><dl className="confirmation-details"><dt>Subject</dt><dd>{issue.subject}</dd><dt>Recipients</dt><dd>{issue.eligibleCount} selected {issue.eligibleCount === 1 ? "recipient" : "recipients"}</dd></dl>{demo && <p className="muted">This demonstration will not send real emails.</p>}<div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button><button autoFocus className="button primary" disabled={busy} onClick={send}>{busy ? "Submitting…" : "Confirm and send"}</button></div></Dialog>}
  </>;
}

function Recipients({ campaignId, onCampaignChange }: { campaignId: number | null; onCampaignChange: (id: number | null) => void }) {
  const [people, setPeople] = useState<Recipient[]>([]), [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Recipient | null>(null), [adding, setAdding] = useState(false);
  const [name, setName] = useState(""), [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [remove, setRemove] = useState<Recipient | null>(null);
  const [issues, setIssues] = useState<IssueRow[]>([]), [choices, setChoices] = useState<IssueRecipients | null>(null);
  const loadSequence = useRef(0);
  function choose(person: Recipient | null) { setSelected(person); setAdding(false); setName(person?.name ?? ""); setEmail(person?.email ?? ""); }
  async function load(initial = false, refreshHistory = false) {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const history = refreshHistory || !issues.length ? await request<IssueRow[]>("/api/issues") : issues;
      const id = campaignId ?? history[0]?.campaignId ?? null;
      const selection = id ? await request<IssueRecipients>(`/api/issues/${id}/recipients`) : null;
      const rows = selection?.recipients ?? await request<Recipient[]>("/api/recipients");
      if (loadSequence.current !== sequence) return;
      setIssues(history); setChoices(selection); setPeople(rows); onCampaignChange(id);
      if (initial) choose(rows[0] ?? null);
    } catch (e) { if (loadSequence.current === sequence) { setError((e as Error).message); setChoices(null); } }
    finally { if (loadSequence.current === sequence) setLoading(false); }
  }
  useEffect(() => { void load(true); return () => { loadSequence.current++; }; }, [campaignId]);
  async function toggle(person: Recipient, included: boolean) {
    if (!choices?.canEdit || busy || loading) return;
    setBusy(true); setError(""); setMessage("Saving receiver choice…");
    const currentChoices = choices;
    setChoices({ ...choices, recipients: choices.recipients.map(p => p.id === person.id ? { ...p, included } : p) });
    try {
      await request(`/api/issues/${currentChoices.campaignId}/recipients/${person.id}`, "PATCH", { included, revision: currentChoices.revision });
      await load(); setMessage(`${person.name || person.email} ${included ? "will receive" : "will skip"} this issue. Future issues are unchanged.`);
    } catch (e) { await load(); setMessage(""); setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await request(adding ? "/api/recipients" : `/api/recipients/${selected?.id}`, adding ? "POST" : "PATCH", { name: name.trim(), email: email.trim() });
      setMessage(adding ? "Recipient added." : "Recipient details saved."); choose(null); await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function removePerson() {
    if (!remove || busy) return; setBusy(true); setError(""); setMessage("");
    try { await request(`/api/recipients/${remove.id}`, "DELETE", {}); setMessage("Recipient removed from this newsletter list."); if (selected?.id === remove.id) choose(null); setRemove(null); await load(); }
    catch (e) { setError((e as Error).message); setRemove(null); }
    finally { setBusy(false); }
  }
  const filtered = people.filter(p => `${p.name} ${p.email}`.toLowerCase().includes(query.trim().toLowerCase()));
  const includedById = new Map(choices?.recipients.map(person => [person.id, person.included]));
  const receiverCount = choices?.recipients.filter(person => person.included).length ?? 0;
  return <>
    <div className="page-heading recipients-heading"><div><h1>Recipients</h1><p>Manage who receives this newsletter.</p></div><button className="text-button refresh" disabled={loading || busy} onClick={() => { setError(""); void load(false, true); }}>Refresh list</button></div>
    {error && <Notice message={error} error />}{message && <Notice message={message} />}
    <section className="issue-recipient-choices" aria-label="Recipient choices for this newsletter">
      <label htmlFor="recipient-issue">Choose receivers for</label>
      <select id="recipient-issue" value={choices?.campaignId ?? campaignId ?? ""} disabled={loading || busy || !issues.length}
        onChange={event => { setError(""); setMessage(""); onCampaignChange(Number(event.target.value)); }}>
        {!issues.length && <option value="">No newsletter available</option>}
        {issues.map(row => <option key={row.campaignId} value={row.campaignId}>{row.subject} · {issueDate(row.date)}</option>)}
      </select>
      <p className="small muted">Tick a recipient to include them in this issue. Each new issue starts with all subscribed recipients selected.</p>
      {choices && <p className="selection-summary">{receiverCount} selected {receiverCount === 1 ? "recipient" : "recipients"}{!choices.canEdit && " · Choices are locked because this issue is no longer awaiting delivery."}</p>}
    </section>
    <div className="recipients-layout"><section className="recipient-table-section" aria-label="Newsletter recipients">
      <div className="recipient-toolbar"><label className="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input type="search" aria-label="Search by name or email" placeholder="Search by name or email" value={query} onChange={e => setQuery(e.target.value)} /></label><button className="button primary" disabled={busy} onClick={() => { choose(null); setAdding(true); setError(""); setMessage(""); }}>Add recipient</button></div>
      <div className="table-wrap" role="region" aria-label="Recipient table; scroll sideways to see all columns" tabIndex={0}><table><thead><tr><th>Receive this issue</th><th>Name</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {filtered.map(p => <tr key={p.id} className={selected?.id === p.id ? "selected" : ""}><td><label className="recipient-choice"><input className="recipient-checkbox" type="checkbox" aria-label={`Send this newsletter to ${p.name || p.email}`} checked={includedById.get(p.id) ?? false} disabled={busy || loading || !choices?.canEdit || !p.subscribed} onChange={event => { void toggle(p, event.target.checked); }} /></label></td><td>{p.name || "—"}</td><td>{p.email || "No email address"}</td><td className={!p.subscribed ? "muted" : ""}>{p.subscribed ? "Subscribed" : "Unsubscribed"}</td><td><div className="row-actions"><button className="text-button" aria-label={`Edit ${p.name || p.email}`} disabled={busy} onClick={() => { choose(p); setError(""); setMessage(""); }}>Edit</button><span aria-hidden="true">|</span><button className="text-button" aria-label={`Remove ${p.name || p.email}`} disabled={busy} onClick={() => setRemove(p)}>Remove</button></div></td></tr>)}
        {!filtered.length && <tr><td colSpan={5} className="table-empty">{loading ? "Loading recipients…" : query ? "No matching recipients." : "No recipients yet. Add your first recipient above."}</td></tr>}
      </tbody></table></div><p className="table-note">Removing someone only removes them from this newsletter list.</p>
    </section>
    <aside className="edit-panel">{selected || adding ? <form onSubmit={save}>
      <h2>{adding ? "Add recipient" : "Edit recipient"}</h2>
      <label htmlFor="recipient-name">Name</label><input id="recipient-name" required maxLength={150} value={name} onChange={e => setName(e.target.value)} disabled={busy} />
      <label htmlFor="recipient-email">Email</label><input id="recipient-email" type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy || Boolean(selected && !selected.subscribed)} />
      {selected && <><label>Subscription status</label><div className="readonly-field">{selected.subscribed ? "Subscribed" : "Unsubscribed"}</div>{!selected.subscribed && <p className="small muted">Their email is locked to preserve their unsubscribe choice.</p>}</>}
      <p className="edit-note">Changes apply to future deliveries.</p><div className="form-actions"><button className="button primary" disabled={busy}>{busy ? "Saving…" : adding ? "Add recipient" : "Save changes"}</button><button type="button" className="text-button" disabled={busy} onClick={() => choose(null)}>Cancel</button></div>
    </form> : <><h2>Recipient details</h2><p className="muted">Choose “Edit” beside a recipient, or add someone to the newsletter list.</p></>}</aside></div>
    {remove && <Dialog title="Remove recipient?" busy={busy} close={() => setRemove(null)}><p>Remove <strong>{remove.name || remove.email}</strong> from this newsletter’s mailing list?</p><p className="muted">Their contact details will remain in Brevo.</p><div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={() => setRemove(null)}>Cancel</button><button autoFocus className="button primary" disabled={busy} onClick={removePerson}>{busy ? "Removing…" : "Remove recipient"}</button></div></Dialog>}
  </>;
}
