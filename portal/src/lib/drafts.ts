import "server-only";
import { neon } from "@neondatabase/serverless";
import { required } from "./config";
import { PortalError } from "./errors";
import { GitHubDrafts } from "./github-drafts";
import { SettingsService } from "./settings";
import { SheetsClient } from "./sheets";
import { BrevoClient } from "./brevo";
import { NeonStore } from "./store";
import { deliveryPolicy, validateCampaign } from "./policy";
import type { DraftRun, DraftState } from "./drafting-types";

function run(row:Record<string,unknown>):DraftRun { return {requestId:String(row.request_id),actor:String(row.actor),createdAt:new Date(String(row.created_at)).toISOString(),state:row.state as DraftState,runId:row.run_id?Number(row.run_id):null,campaignId:row.campaign_id?Number(row.campaign_id):null,message:row.message?String(row.message):null}; }
const active=(state:DraftState)=>["submitting","queued","running","unknown"].includes(state);
export class DraftService {
  private sql=neon(required("DATABASE_URL"));
  private github=new GitHubDrafts();
  private async rows() { return (await this.sql`SELECT * FROM portal_draft_requests ORDER BY created_at DESC LIMIT 20`).map(run); }
  private async update(id:string,state:DraftState,runId:number|null,campaignId:number|null,message:string|null) {
    const changed=await this.sql`UPDATE portal_draft_requests SET state=${state},run_id=${runId},campaign_id=${campaignId},message=${message},updated_at=now() WHERE request_id=${id} AND state IN ('submitting','queued','running','unknown') RETURNING *`;
    const row=changed[0]??(await this.sql`SELECT * FROM portal_draft_requests WHERE request_id=${id}`)[0];
    return run(row);
  }
  private async refresh(current:DraftRun) {
    if(!active(current.state)||!this.github.configured) return current;
    const runId=current.runId??await this.github.find(current.requestId);
    if(!runId) {
      if(["submitting","queued"].includes(current.state)&&Date.now()-Date.parse(current.createdAt)>60000) return {...current,...await this.update(current.requestId,"unknown",null,null,"GitHub acceptance is uncertain. Contact the site owner before requesting another draft.")};
      return current;
    }
    const info=await this.github.run(runId);
    const workflow=await this.github.workflow();
    if(info.workflow_id!==workflow.id||info.display_title!==`PPP draft ${this.github.environment} ${current.requestId}`) throw new PortalError(503,"The workflow run does not match this draft request.");
    if(info.status!=="completed") return {...current,...await this.update(current.requestId,info.status==="in_progress"?"running":"queued",runId,null,null)};
    const result=await this.github.result(runId,current.requestId);
    if(!result) return {...current,...await this.update(current.requestId,"unknown",runId,null,"The workflow finished without a confirmed draft result. Contact the site owner.")};
    if(result.outcome==="unknown") return {...current,...await this.update(current.requestId,"unknown",runId,null,"Campaign creation is uncertain. Contact the site owner before creating another draft.")};
    if(result.outcome!=="ready"||!Number.isSafeInteger(result.campaign_id)||Number(result.campaign_id)<1) return {...current,...await this.update(current.requestId,"failed",runId,null,"Draft creation did not finish. Review the workflow with the site owner, then submit a fresh request.")};
    const campaignId=result.campaign_id!;
    if(!(await new SheetsClient().issues()).some(i=>i.campaignId===campaignId)) throw new PortalError(503,"The draft result is not yet available in issue history. Refresh its progress.");
    const campaign=await new BrevoClient().campaign(campaignId);
    if(campaign.status!=="draft") return {...current,...await this.update(current.requestId,"failed",runId,null,"The result is no longer an unsent draft.")};
    validateCampaign(campaign,deliveryPolicy().listId);
    return {...current,...await this.update(current.requestId,"ready",runId,campaignId,"Your draft is ready for review. No email was sent.")};
  }
  async overview() {
    let rows=await this.rows();
    if(!this.github.configured) return {available:false,reason:this.github.preview?"Preview draft creation needs isolated GitHub setup.":"Draft creation needs GitHub setup by the site owner.",runs:rows};
    try { rows=await Promise.all(rows.map(r=>this.refresh(r))); const workflow=await this.github.workflow(); return {available:workflow.state==="active",reason:workflow.state==="active"?null:"Draft creation is unavailable because the GitHub workflow is disabled.",runs:rows}; }
    catch(error) { return {available:false,reason:error instanceof PortalError?error.message:"GitHub progress is temporarily unavailable. Refresh later.",runs:rows}; }
  }
  async detail(id:string) {
    const rows=await this.sql`SELECT * FROM portal_draft_requests WHERE request_id=${id}`;
    if(!rows.length) throw new PortalError(404,"Draft request not found.");
    return this.refresh(run(rows[0]));
  }
  async create(actor:string,id:string) {
    const store=new NeonStore(), scope="draft_creation", token=await store.lock(scope,"create_draft");
    try {
      const previous=await this.sql`SELECT * FROM portal_draft_requests WHERE request_id=${id}`;
      if(previous.length) return run(previous[0]);
      const overview=await this.overview();
      if(!overview.available) throw new PortalError(503,overview.reason!);
      if(overview.runs.some(r=>active(r.state))||await this.github.active()) throw new PortalError(409,"Another draft is queued, being created, or unresolved. Refresh its progress first.");
      if(!(await new SettingsService().get()).sources.some(s=>s.enabled)) throw new PortalError(409,"Enable at least one news source in Settings before creating a draft.");
      const rows=await this.sql`INSERT INTO portal_draft_requests(request_id,actor,state) VALUES(${id},${actor},'submitting') RETURNING *`;
      const current=run(rows[0]);
      try { const runId=await this.github.dispatch(id); return {...current,...await this.update(id,"queued",runId,null,null)}; }
      catch(error) {
        const definitive=error instanceof PortalError;
        return {...current,...await this.update(id,definitive?"failed":"unknown",null,null,definitive?error.message:"GitHub acceptance could not be confirmed. No automatic retry will occur. Contact the site owner.")};
      }
    } finally { await store.unlock(scope,token); }
  }
}
