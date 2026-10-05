import "server-only";
import { unzipSync, strFromU8 } from "fflate";
import { PortalError } from "./errors";

const repository = "Lecberg/PPP-Newsletter";
const workflow = "weekly-newsletter.yml";
export class GitHubDrafts {
  readonly preview = Boolean(process.env.VERCEL_ENV) && process.env.VERCEL_ENV !== "production";
  readonly environment = this.preview ? "preview" : "production";
  readonly ref = this.preview ? process.env.PORTAL_DRAFT_REF : "main";
  get configured() { return Boolean(process.env.PORTAL_GITHUB_TOKEN && this.ref && (!this.preview || process.env.PORTAL_DRAFT_PREVIEW_READY === "true")); }
  private async request(path:string, method="GET", body?:unknown) {
    if (!this.configured) throw new PortalError(503,"Draft creation needs GitHub setup by the site owner.");
    const response=await fetch(`https://api.github.com/repos/${repository}/actions/${path}`,{method,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${process.env.PORTAL_GITHUB_TOKEN}`,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2026-03-10","Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
    return response;
  }
  async workflow() {
    const response=await this.request(`workflows/${workflow}`);
    if(!response.ok) throw new PortalError(503,"GitHub workflow status could not be read. Contact the site owner.");
    return await response.json() as {id:number;state:string};
  }
  async dispatch(requestId:string) {
    const response=await this.request(`workflows/${workflow}/dispatches`,"POST",{ref:this.ref,inputs:{request_id:requestId,environment:this.environment}});
    if(!response.ok) {
      if(response.status>=500) throw new Error("UncertainDispatch");
      throw new PortalError(502,"GitHub rejected draft creation. Contact the site owner.");
    }
    if(response.status===204) return null;
    const value=await response.json();
    return Number.isSafeInteger(value.workflow_run_id)?value.workflow_run_id as number:null;
  }
  async find(requestId:string) {
    const response=await this.request(`workflows/${workflow}/runs?event=workflow_dispatch&per_page=100`);
    if(!response.ok) throw new PortalError(503,"GitHub progress could not be refreshed.");
    const value=await response.json();
    return (value.workflow_runs as {id:number;display_title:string}[]).find(r=>r.display_title===`PPP draft ${this.environment} ${requestId}`)?.id??null;
  }
  async active() {
    const response=await this.request(`workflows/${workflow}/runs?per_page=100`);
    if(!response.ok) throw new PortalError(503,"GitHub progress could not be read.");
    const value=await response.json();
    return value.workflow_runs.some((r:{status:string;display_title:string})=>r.status!=="completed"&&r.display_title?.startsWith(`PPP draft ${this.environment} `));
  }
  async run(runId:number) {
    const response=await this.request(`runs/${runId}`);
    if(!response.ok) throw new PortalError(503,"GitHub progress could not be refreshed.");
    return await response.json() as {id:number;workflow_id:number;status:string;conclusion:string|null;display_title:string};
  }
  async result(runId:number,requestId:string) {
    const response=await this.request(`runs/${runId}/artifacts?per_page=100`);
    if(!response.ok) throw new PortalError(503,"The draft result could not be read.");
    const value=await response.json();
    const artifact=value.artifacts?.find((a:{name:string;expired:boolean;size_in_bytes:number})=>a.name===`draft-result-${runId}`&&!a.expired&&a.size_in_bytes<=65536);
    if(!artifact) return null;
    const download=await fetch(`https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}/zip`,{cache:"no-store",redirect:"manual",signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${process.env.PORTAL_GITHUB_TOKEN}`,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2026-03-10"}});
    const location=download.headers.get("location");
    if(download.status!==302||!location||new URL(location).protocol!=="https:") throw new PortalError(503,"The draft result could not be downloaded.");
    // GitHub's signed download receives no API credential.
    const bytes=await fetch(location,{cache:"no-store",signal:AbortSignal.timeout(15000)});
    if(!bytes.ok||Number(bytes.headers.get("content-length"))>65536) throw new PortalError(503,"The draft result is unavailable.");
    const buffer=new Uint8Array(await bytes.arrayBuffer());
    if(buffer.length>65536) throw new PortalError(503,"The draft result is too large.");
    const entries=unzipSync(buffer,{filter:file=>file.name==="draft-result.json"&&file.originalSize<=8192});
    if(!entries["draft-result.json"]) throw new PortalError(503,"The draft result is missing.");
    const result=JSON.parse(strFromU8(entries["draft-result.json"]));
    if(result.request_id!==requestId||String(result.run_id)!==String(runId)||result.environment!==this.environment||!["ready","failed","unknown","skipped"].includes(result.outcome)) throw new PortalError(503,"The draft result does not match this request.");
    return result as {outcome:string;campaign_id?:number;message?:string};
  }
}
