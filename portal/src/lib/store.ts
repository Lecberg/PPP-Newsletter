import "server-only";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { required } from "./config";
import { PortalError } from "./errors";
import type { Approval, ApprovalOutcome, RecipientSelection, StorePort } from "./types";

export class NeonStore implements StorePort {
  private sql() { return neon(required("DATABASE_URL")); }
  async selection(id: number, listId: number): Promise<RecipientSelection> {
    const sql = this.sql(), rows = await sql`SELECT excluded_ids, revision, exclusion_list_id FROM portal_recipient_selections WHERE campaign_id = ${id} AND list_id = ${listId}`;
    const row = rows[0];
    return row ? { excludedIds: row.excluded_ids.map(Number), revision: Number(row.revision), exclusionListId: row.exclusion_list_id === null ? null : Number(row.exclusion_list_id) }
      : { excludedIds: [], revision: 0, exclusionListId: null };
  }
  async setSelection(id: number, listId: number, contactId: number, included: boolean, revision: number) {
    const sql = this.sql();
    const rows = await sql`INSERT INTO portal_recipient_selections (campaign_id, list_id, excluded_ids, revision)
      SELECT ${id}, ${listId}, ${included ? [] : [contactId]}::bigint[], 1
      WHERE ${revision} = 0 OR EXISTS (SELECT 1 FROM portal_recipient_selections
        WHERE campaign_id = ${id} AND list_id = ${listId} AND revision = ${revision})
      ON CONFLICT (campaign_id, list_id) DO UPDATE SET excluded_ids =
        CASE WHEN ${included} THEN array_remove(portal_recipient_selections.excluded_ids, ${contactId}::bigint)
        ELSE ARRAY(SELECT DISTINCT x FROM unnest(portal_recipient_selections.excluded_ids || ARRAY[${contactId}::bigint]) x) END,
        revision = portal_recipient_selections.revision + 1, updated_at = now()
      WHERE portal_recipient_selections.revision = ${revision} RETURNING campaign_id`;
    if (!rows.length) throw new PortalError(409, "Recipient choices changed in another tab. Refresh and choose again.");
  }
  async setExclusionList(id: number, listId: number, exclusionListId: number) {
    const sql = this.sql();
    const rows = await sql`INSERT INTO portal_recipient_selections (campaign_id, list_id, exclusion_list_id)
      VALUES (${id}, ${listId}, ${exclusionListId}) ON CONFLICT (campaign_id, list_id) DO UPDATE
      SET exclusion_list_id = EXCLUDED.exclusion_list_id WHERE portal_recipient_selections.exclusion_list_id IS NULL
        OR portal_recipient_selections.exclusion_list_id = EXCLUDED.exclusion_list_id RETURNING campaign_id`;
    if (!rows.length) throw new PortalError(409, "The campaign's delivery settings changed. Refresh before sending.");
  }
  async lock(scope: string, operation: string) {
    const token = randomUUID(), sql = this.sql();
    const rows = await sql`INSERT INTO portal_locks (scope, token, operation) VALUES (${scope}, ${token}, ${operation}) ON CONFLICT DO NOTHING RETURNING token`;
    if (!rows.length) throw new PortalError(409, "Another change or delivery is being processed. Refresh in a moment. If it stays busy, contact the site owner.");
    return token;
  }
  async unlock(scope: string, token: string) {
    const sql = this.sql();
    await sql`DELETE FROM portal_locks WHERE scope = ${scope} AND token = ${token}`;
  }
  async approval(id: number): Promise<Approval | null> {
    const sql = this.sql(), rows = await sql`SELECT * FROM portal_approvals WHERE campaign_id = ${id}`;
    if (!rows.length) return null;
    const r = rows[0];
    return { campaignId: Number(r.campaign_id), listId: Number(r.list_id), approvedBy: r.approved_by,
      approvedAt: new Date(r.approved_at).toISOString(), fingerprint: r.fingerprint, snapshot: r.snapshot,
      outcome: r.outcome, detail: r.detail, sheetSynced: r.sheet_synced };
  }
  async begin(a: Omit<Approval, "approvedAt" | "sheetSynced">) {
    const sql = this.sql();
    const queries = [
      sql`INSERT INTO portal_approvals (campaign_id, list_id, approved_by, fingerprint, snapshot, outcome)
        VALUES (${a.campaignId}, ${a.listId}, ${a.approvedBy}, ${a.fingerprint}, ${JSON.stringify(a.snapshot)}::jsonb, 'submitting')
        ON CONFLICT (campaign_id) DO UPDATE SET approved_by = EXCLUDED.approved_by, approved_at = now(),
          fingerprint = EXCLUDED.fingerprint, snapshot = EXCLUDED.snapshot, outcome = 'submitting',
          detail = NULL, updated_at = now(), sheet_synced = false
        WHERE portal_approvals.outcome = 'rejected' RETURNING campaign_id`,
      sql`INSERT INTO portal_delivery_attempts (campaign_id, approved_at, list_id, approved_by, fingerprint, snapshot, outcome)
        SELECT campaign_id, approved_at, list_id, approved_by, fingerprint, snapshot, outcome FROM portal_approvals
        WHERE campaign_id = ${a.campaignId} AND outcome = 'submitting'
        ON CONFLICT DO NOTHING`,
      sql`INSERT INTO portal_operations (actor, operation, target, outcome) VALUES (${a.approvedBy}, 'approve_delivery', ${String(a.campaignId)}, 'attempt')`
    ];
    const results = await sql.transaction(queries);
    if (!results[0].length) throw new PortalError(409, "This campaign already has a delivery request. Check its status before taking further action.");
  }
  async outcome(id: number, outcome: ApprovalOutcome, detail?: string) {
    const sql = this.sql();
    await sql.transaction([
      sql`UPDATE portal_approvals SET outcome = ${outcome}, detail = ${detail ?? null}, updated_at = now(), sheet_synced = false WHERE campaign_id = ${id}`,
      sql`UPDATE portal_delivery_attempts SET outcome = ${outcome}, detail = ${detail ?? null}, updated_at = now()
        WHERE campaign_id = ${id} AND approved_at = (SELECT approved_at FROM portal_approvals WHERE campaign_id = ${id})`
    ]);
  }
  async synced(id: number) { const sql = this.sql(); await sql`UPDATE portal_approvals SET sheet_synced = true WHERE campaign_id = ${id}`; }
  async log(actor: string, operation: string, target: string, outcome: string) {
    const sql = this.sql();
    await sql`INSERT INTO portal_operations (actor, operation, target, outcome) VALUES (${actor}, ${operation}, ${target}, ${outcome})`;
  }
}
