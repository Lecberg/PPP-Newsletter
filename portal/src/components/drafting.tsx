"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { approvalDate } from "@/lib/display";
import type { DraftOverview, DraftRun, PortalSettings, NewsSource } from "@/lib/drafting-types";

async function request<T>(path:string,method="GET",body?:unknown):Promise<T> {
  const response=await fetch(path,{method,cache:"no-store",headers:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  if(response.status===401) { window.location.assign("/login"); throw new Error("Please sign in again."); }
  const value=await response.json();
  if(!response.ok) throw new Error(value.error??"The operation could not be completed.");
  return value;
}
const labels={submitting:"Queued",queued:"Queued",running:"Creating draft",ready:"Ready",failed:"Failed",unknown:"Outcome unknown"};
const pending=(run:DraftRun)=>["submitting","queued","running","unknown"].includes(run.state);
export function DraftControls({onReady,demo}:{onReady:(id:number)=>void;demo:boolean}) {
  const [overview,setOverview]=useState<DraftOverview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [confirm,setConfirm]=useState(false);
  const creating=useRef(false),lastOpened=useRef<string|null>(null),requestId=useRef<string|null>(null);
  const readyCallback=useRef(onReady); readyCallback.current=onReady;
  const alive=useRef(true);
  const load=useCallback(async()=> {
    if(demo)return;
    try { const value=await request<DraftOverview>("/api/draft-runs");if(alive.current) {setOverview(value);setError("");} }
    catch(e) {if(alive.current)setError((e as Error).message);}
  },[demo]);
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[load]);
  const active=overview?.runs.find(pending);
  useEffect(()=> {
    if(!active||demo)return;
    const refresh=()=>{if(document.visibilityState==="visible")void load();};
    const timer=setInterval(refresh,15000);document.addEventListener("visibilitychange",refresh);
    return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",refresh);};
  },[active?.requestId,active?.state,load,demo]);
  useEffect(()=> {
    const own=requestId.current?overview?.runs.find(r=>r.requestId===requestId.current):null;
    if(own?.state==="ready"&&own.campaignId&&lastOpened.current!==own.requestId) {lastOpened.current=own.requestId;readyCallback.current(own.campaignId);}
  },[overview]);
  async function create() {
    if(creating.current)return;creating.current=true;setBusy(true);setError("");
    // Retain this number if the browser loses the response. Repeating it cannot create another run.
    requestId.current??=crypto.randomUUID();
    try { const run=await request<DraftRun>("/api/draft-runs","POST",{requestId:requestId.current});setOverview(previous=>({available:previous?.available??true,reason:previous?.reason??null,runs:[run,...(previous?.runs??[]).filter(r=>r.requestId!==run.requestId)]}));setConfirm(false); }
    catch(e) {setError((e as Error).message);}
    finally {setBusy(false);creating.current=false;}
  }
  const latest=overview?.runs[0];
  return <section className="draft-controls" aria-label="Draft creation">
    <div className="draft-controls-heading"><div><h2>Create a new draft</h2><p className="small muted">Collect news using saved settings. No email is sent.</p></div><button className="button primary" disabled={demo||busy||!overview?.available||Boolean(active)} onClick={()=>{if(latest?.state==="ready"||latest?.state==="failed")requestId.current=null;setConfirm(true);}}>Create draft now</button></div>
    {demo?<p className="small muted">Draft creation is unavailable in the local demonstration.</p>:overview?.reason&&<p role="status" className="small muted">{overview.reason}</p>}
    {error&&<div className="notice error" role="alert">{error}</div>}
    {confirm&&<div className="draft-confirmation" role="region" aria-label="Confirm draft creation"><p>Create a separate draft now? This uses the saved sources and keywords. It does not send a newsletter.</p><div className="form-actions"><button className="button primary" disabled={busy} onClick={()=>void create()}>{busy?"Requesting…":"Create draft"}</button><button className="text-button" disabled={busy} onClick={()=>setConfirm(false)}>Cancel</button></div></div>}
    {!!overview?.runs.length&&<details className="draft-history" open={Boolean(active)}><summary>{active?labels[active.state]:"Recent draft requests"}</summary>{overview.runs.map(run=><div className="draft-run" key={run.requestId}><strong>{labels[run.state]}</strong><span className="small muted">{run.actor} · {approvalDate(run.createdAt)}</span>{run.message&&<p className="small">{run.message}</p>}{run.state==="ready"&&run.campaignId&&<button className="text-button underline" onClick={()=>onReady(run.campaignId!)}>Open draft</button>}</div>)}<button className="text-button underline" disabled={busy} onClick={()=>void load()}>Refresh draft progress</button></details>}
  </section>;
}

export function Settings({demo,onDirtyChange}:{demo:boolean;onDirtyChange:(dirty:boolean)=>void}) {
  const [settings,setSettings]=useState<PortalSettings|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [dirty,setDirty]=useState(false);
  useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false);},[dirty,onDirtyChange]);
  async function load() {setLoading(true);setError("");try {setSettings(await request<PortalSettings>("/api/settings"));setDirty(false);}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
  useEffect(()=>{if(demo){setLoading(false);return;}void load();},[demo]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty]);
  function change<K extends keyof PortalSettings>(key:K,value:PortalSettings[K]) {setSettings(s=>s?{...s,[key]:value}:s);setDirty(true);setMessage("");}
  function source(index:number,patch:Partial<NewsSource>) {if(settings)change("sources",settings.sources.map((s,i)=>i===index?{...s,...patch}:s));}
  async function save(event:FormEvent) {event.preventDefault();if(!settings||busy)return;setBusy(true);setError("");setMessage("");try{setSettings(await request<PortalSettings>("/api/settings","PUT",settings));setDirty(false);setMessage("Settings saved. They apply to the next draft run.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <>
    <div className="page-heading"><div><h1>Settings</h1><p>Choose your news sources, keywords, and draft schedule.</p></div><button className="text-button refresh" disabled={busy||loading||demo} onClick={()=>{if(!dirty||window.confirm("Discard your unsaved settings and refresh?"))void load();}}>Refresh settings</button></div>
    {demo&&<div className="notice" role="status">Settings are unavailable in this local demonstration.</div>}{error&&<div className="notice error" role="alert">{error}</div>}{message&&<div className="notice success" role="status">{message}</div>}{loading&&<p role="status">Loading settings…</p>}
    {settings&&!loading&&<form className="settings-form" onSubmit={save}><fieldset disabled={busy}>
      <section className="settings-section"><h2>Draft schedule</h2><label className="automatic-choice"><input type="checkbox" checked={settings.automaticDrafting} onChange={e=>change("automaticDrafting",e.target.checked)}/><span>Automatic drafting: <strong>{settings.automaticDrafting?"On":"Off"}</strong></span></label><p className="small muted">Off pauses scheduled drafts. You can still use Create draft now. A run already underway continues.</p>
      <div className="settings-grid"><label>Frequency<select value={settings.cadence} onChange={e=>change("cadence",e.target.value as "weekly"|"monthly")}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
      {settings.cadence==="weekly"?<label>Day of week<select value={settings.weekday} onChange={e=>change("weekday",e.target.value)}>{["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].map(day=><option key={day} value={day}>{day[0].toUpperCase()+day.slice(1)}</option>)}</select></label>:<label>Day of month<input type="number" min={1} max={31} required value={settings.monthDay} onChange={e=>change("monthDay",Number(e.target.value))}/></label>}
      <label>Draft hour<select value={settings.hour} onChange={e=>change("hour",Number(e.target.value))}>{Array.from({length:24},(_,hour)=><option key={hour} value={hour}>{String(hour).padStart(2,"0")}:00</option>)}</select></label><label>Time zone<input required maxLength={100} value={settings.timezone} placeholder="Asia/Hong_Kong" onChange={e=>change("timezone",e.target.value)}/></label></div>
      <p className="small muted">Drafting starts during the selected hour. Days beyond a month’s length use its last day. Delivery always needs your separate confirmation.</p></section>
      <section className="settings-section"><h2>Keywords</h2><label htmlFor="settings-keywords">English and Chinese keywords</label><textarea id="settings-keywords" rows={8} maxLength={32000} value={settings.keywords} onChange={e=>change("keywords",e.target.value)}/><p className="small muted">Use one keyword per line, or separate them with commas. Leaving this blank restores the default keywords.</p></section>
      <section className="settings-section"><div className="settings-section-heading"><h2>News sources</h2><button type="button" className="button secondary" disabled={settings.sources.length>=100} onClick={()=>change("sources",[...settings.sources,{rowId:null,name:"",url:"",sourceType:"official_html",priority:3,enabled:true}])}>Add source</button></div><p className="small muted">Pause a source without removing it. Priority values are saved; article ranking stays unchanged.</p>
      {settings.sources.map((s,index)=><div className="source-card" key={s.rowId??`new-${index}`}><div className="source-card-heading"><label className="automatic-choice"><input type="checkbox" checked={s.enabled} onChange={e=>source(index,{enabled:e.target.checked})}/><span>{s.enabled?"Enabled":"Paused"}</span></label><button type="button" className="text-button underline" aria-label={`Remove source ${s.name||index+1}`} onClick={()=>change("sources",settings.sources.filter((_,i)=>i!==index))}>Remove source</button></div><div className="settings-grid"><label>Name<input required maxLength={150} value={s.name} onChange={e=>source(index,{name:e.target.value})}/></label><label>Website address<input type="url" required maxLength={2048} value={s.url} onChange={e=>source(index,{url:e.target.value})}/></label><label>Source type<select value={s.sourceType} onChange={e=>source(index,{sourceType:e.target.value})}><option value="official_html">Official website</option><option value="media_html">News website</option><option value="rss">News feed (RSS)</option><option value="html">Other website</option></select></label><label>Priority<input type="number" required min={1} max={100} value={s.priority} onChange={e=>source(index,{priority:Number(e.target.value)})}/></label></div></div>)}
      {!settings.sources.length&&<p>No news sources. Add one before requesting a draft.</p>}</section>
      <div className="settings-actions"><button className="button primary" disabled={!dirty||busy}>{busy?"Saving…":"Save changes"}</button><span className="small muted">{dirty?"You have unsaved changes.":"Saved settings are shown."}</span></div>
    </fieldset></form>}
  </>;
}
