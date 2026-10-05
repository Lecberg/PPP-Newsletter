import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { SheetsClient } from "./sheets";
import { NeonStore } from "./store";
import { required } from "./config";
import { PortalError } from "./errors";
import type { PortalSettings } from "./drafting-types";

const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export const settingsInput = z.object({
  version: z.string().regex(/^[a-f0-9]{64}$/), keywords: z.string().max(32000),
  cadence: z.enum(["weekly", "monthly"]), weekday: z.enum(weekdays),
  monthDay: z.number().int().min(1).max(31), hour: z.number().int().min(0).max(23),
  timezone: z.string().trim().min(1).max(100), automaticDrafting: z.boolean(),
  sources: z.array(z.object({rowId: z.number().int().positive().nullable(), name: z.string().trim().min(1).max(150),
    url: z.string().trim().max(2048).url(), sourceType: z.enum(["official_html", "media_html", "rss", "html"]),
    priority: z.number().int().min(1).max(100), enabled: z.boolean()}).strict()).max(100)
}).strict();
type Grid = { sheetId: number; title: string; gridProperties: { rowCount: number; columnCount: number } };
const configKeys = ["keywords", "cadence", "send_weekday", "send_day_of_month", "send_hour", "timezone", "automatic_drafting_enabled"];
const sourceKeys = ["name", "url", "source_type", "priority", "enabled"];
const bool = (v: string) => ["true", "yes", "1", "enabled"].includes(v?.trim().toLowerCase());
function integer(v: string, fallback: number, lo: number, hi: number) { const n = Number(v); return v?.trim() && Number.isInteger(n) ? Math.min(hi, Math.max(lo,n)) : fallback; }
function hash(v: unknown) { return createHash("sha256").update(JSON.stringify(v)).digest("hex"); }
export function privateAddress(address: string) {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(ip) === 4) { const p = ip.split(".").map(Number); return p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 || (p[0] === 100 && p[1]>=64 && p[1]<=127) || (p[0]===169 && p[1]===254) || (p[0]===172 && p[1]>=16 && p[1]<=31) || (p[0]===192 && p[1]===168); }
  if (isIP(ip) === 6) return !ip.startsWith("2") && !ip.startsWith("3");
  return true;
}
async function validate(settings: PortalSettings) {
  try { new Intl.DateTimeFormat("en", {timeZone:settings.timezone}).format(); }
  catch { throw new PortalError(400, "Choose a valid time zone, such as Asia/Hong_Kong."); }
  const urls = new Set<string>(), rows = new Set<number>();
  for (const source of settings.sources) {
    if (source.rowId !== null && rows.has(source.rowId)) throw new PortalError(400, "A source was included twice.");
    if (source.rowId !== null) rows.add(source.rowId);
    const url = new URL(source.url);
    if (!["https:","http:"].includes(url.protocol) || url.username || url.password || (url.port && !["80","443"].includes(url.port))) throw new PortalError(400, "Use a public http or https website address without passwords or custom ports.");
    if (urls.has(url.href)) throw new PortalError(400, "Two sources have the same website address.");
    urls.add(url.href);
    let addresses;
    try { addresses = await lookup(url.hostname.replace(/^\[|\]$/g,""), {all:true}); }
    catch { throw new PortalError(400, `The website for ${source.name} could not be found.`); }
    if (!addresses.length || addresses.some(a => privateAddress(a.address))) throw new PortalError(400, "Sources must use public websites, not private network addresses.");
  }
}

export class SettingsService {
  private sheet = new SheetsClient();
  private async read() {
    const data = await this.sheet.request<{valueRanges: {values?: string[][]}[]}>("/values:batchGet?ranges=Config!A1:AZ&ranges=Sources!A1:AZ");
    const [config,sources] = data.valueRanges.map(r => r.values ?? []);
    if (!["key","value"].every(k=>config[0]?.includes(k)) || !sourceKeys.every(k=>sources[0]?.includes(k))) throw new PortalError(503,"The settings sheets are missing required column names.");
    const k = config[0].indexOf("key"), v = config[0].indexOf("value");
    const values = new Map(config.slice(1).filter(r=>r[k]?.trim()).map(r=>[r[k].trim(),r[v]??""]));
    const get = (key:string) => values.get(key) ?? "";
    const h = sources[0], field = (row:string[],key:string) => row[h.indexOf(key)]??"";
    const settings: PortalSettings = { version:hash({config,sources}), keywords:get("keywords"), cadence:get("cadence").toLowerCase()==="monthly"?"monthly":"weekly",
      weekday:weekdays.includes(get("send_weekday").toLowerCase() as typeof weekdays[number])?get("send_weekday").toLowerCase():"monday",
      monthDay:integer(get("send_day_of_month"),1,1,31),hour:integer(get("send_hour"),8,0,23),timezone:get("timezone")||"Asia/Hong_Kong",automaticDrafting:bool(get("automatic_drafting_enabled")),
      sources:sources.slice(1).flatMap((row,index)=>!field(row,"name").trim()&&!field(row,"url").trim()?[]:[{rowId:index+2,name:field(row,"name"),url:field(row,"url"),sourceType:field(row,"source_type")||"html",priority:integer(field(row,"priority"),3,1,100),enabled:bool(field(row,"enabled")||"TRUE")}]) };
    return {config,sources,settings};
  }
  async get() { return (await this.read()).settings; }
  async save(actor:string, next:PortalSettings) {
    await validate(next);
    const store = new NeonStore(), scope = `settings:${required("GOOGLE_SHEET_ID")}`, token = await store.lock(scope,"save_settings");
    const sql = neon(required("DATABASE_URL")), id = randomUUID();
    let began = false, attempted = false;
    try {
      if ((await sql`SELECT id FROM portal_settings_changes WHERE outcome IN ('submitting','unknown') LIMIT 1`).length) throw new PortalError(409,"An earlier settings save is unresolved. Contact the site owner before saving again.");
      const current = await this.read();
      if (current.settings.version !== next.version) throw new PortalError(409,"Settings changed since you opened this page. Refresh before saving.");
      if (next.sources.some(s=>s.rowId!==null&&!current.settings.sources.some(c=>c.rowId===s.rowId))) throw new PortalError(409,"A news source changed. Refresh before saving.");
      const metadata = await this.sheet.request<{sheets:{properties:Grid}[]}>("?fields=sheets(properties)");
      const configGrid = metadata.sheets.find(s=>s.properties.title==="Config")?.properties;
      const sourceGrid = metadata.sheets.find(s=>s.properties.title==="Sources")?.properties;
      if (!configGrid || !sourceGrid) throw new PortalError(503,"The settings sheets could not be found.");
      const requests:unknown[] = [];
      const cell = (grid:Grid,row:number,column:number,value:string) => requests.push({updateCells:{start:{sheetId:grid.sheetId,rowIndex:row,columnIndex:column},rows:[{values:[{userEnteredValue:{stringValue:value}}]}],fields:"userEnteredValue"}});
      const configValues:Record<string,string> = {keywords:next.keywords,cadence:next.cadence,send_weekday:next.weekday,send_day_of_month:String(next.monthDay),send_hour:String(next.hour),timezone:next.timezone,automatic_drafting_enabled:next.automaticDrafting?"TRUE":"FALSE"};
      const keyColumn=current.config[0].indexOf("key"),valueColumn=current.config[0].indexOf("value");
      for (const key of configKeys) {
        const matches=current.config.slice(1).flatMap((row,i)=>row[keyColumn]?.trim()===key?[i+1]:[]);
        if (matches.length) matches.forEach(row=>cell(configGrid,row,valueColumn,configValues[key]));
        else { const values=Array.from({length:Math.max(keyColumn,valueColumn)+1},()=>({userEnteredValue:{stringValue:""}})); values[keyColumn].userEnteredValue.stringValue=key; values[valueColumn].userEnteredValue.stringValue=configValues[key]; requests.push({appendCells:{sheetId:configGrid.sheetId,rows:[{values}],fields:"userEnteredValue"}}); }
      }
      const sourceValues = (source:PortalSettings["sources"][number]):Record<string,string>=>({name:source.name,url:source.url,source_type:source.sourceType,priority:String(source.priority),enabled:source.enabled?"TRUE":"FALSE"});
      for (const source of next.sources.filter(s=>s.rowId!==null)) for(const key of sourceKeys) cell(sourceGrid,source.rowId!-1,current.sources[0].indexOf(key),sourceValues(source)[key]);
      for (const source of current.settings.sources.filter(s=>!next.sources.some(n=>n.rowId===s.rowId)).sort((a,b)=>b.rowId!-a.rowId!)) requests.push({deleteDimension:{range:{sheetId:sourceGrid.sheetId,dimension:"ROWS",startIndex:source.rowId!-1,endIndex:source.rowId!}}});
      for (const source of next.sources.filter(s=>s.rowId===null)) { const fields=sourceValues(source); const values=current.sources[0].map(key=>({userEnteredValue:{stringValue:fields[key]??""}})); requests.push({appendCells:{sheetId:sourceGrid.sheetId,rows:[{values}],fields:"userEnteredValue"}}); }
      await sql`INSERT INTO portal_settings_changes(id,actor,previous_version,before_settings,after_settings,outcome) VALUES(${id},${actor},${next.version},${JSON.stringify(current.settings)}::jsonb,${JSON.stringify(next)}::jsonb,'submitting')`;
      began=true; attempted=true;
      await this.sheet.request(":batchUpdate","POST",{requests});
      await sql`UPDATE portal_settings_changes SET outcome='saved' WHERE id=${id}`;
      return await this.get();
    } catch(error) {
      if (began) await sql`UPDATE portal_settings_changes SET outcome=${attempted?"unknown":"failed"} WHERE id=${id}`.catch(()=>undefined);
      if (attempted) throw new PortalError(503,"The save result could not be confirmed. Refresh Settings before trying again.");
      throw error;
    } finally { await store.unlock(scope,token); }
  }
}
