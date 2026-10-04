export type Campaign = {
  id: number; subject: string; htmlContent: string; status: string;
  sender?: { id?: number; email?: string; name?: string };
  recipients?: { listIds?: number[]; lists?: number[]; exclusionListIds?: number[]; exclusionLists?: number[]; segmentIds?: number[]; segments?: number[]; excludedSegments?: number[]; [key: string]: unknown };
  scheduledAt?: string; type?: string; abTesting?: boolean;
};
export type Contact = {
  id: number; email?: string; attributes?: Record<string, unknown>;
  listIds?: number[]; emailBlacklisted?: boolean; listUnsubscribed?: number[];
};
export type Recipient = { id: number; name: string; email: string; subscribed: boolean };
export type RecipientSelection = { excludedIds: number[]; revision: number; exclusionListId: number | null };
export type IssueRecipients = { campaignId: number; subject: string; revision: number; canEdit: boolean; recipients: (Recipient & { included: boolean })[] };
export type IssueRow = { campaignId: number; date: string; subject: string; status?: string };
export type ApprovalOutcome = "submitting" | "submitted" | "sent" | "unknown" | "rejected";
export type Approval = { campaignId: number; listId: number; approvedBy: string; approvedAt: string; fingerprint: string; snapshot: ReviewSnapshot; outcome: ApprovalOutcome; detail?: string; sheetSynced: boolean };
export type ReviewSnapshot = { campaign: Campaign; recipients: Recipient[]; listId: number; selection?: { excludedIds: number[]; revision: number }; deliveryTarget?: { exclusionListId: number | null } };
export type IssueDetail = IssueRow & {
  html: string; status: string; eligibleCount: number; recipientCount: number;
  fingerprint: string; canSend: boolean; sendDisabledReason: string | null;
  approval: { approvedBy: string; approvedAt: string; outcome: ApprovalOutcome } | null;
};
export interface BrevoPort {
  campaign(id: number): Promise<Campaign>;
  contacts(listId: number): Promise<Contact[]>;
  contact(id: number | string): Promise<Contact | null>;
  add(listId: number, name: string, email: string): Promise<void>;
  update(id: number, name: string, email: string): Promise<void>;
  remove(listId: number, id: number): Promise<void>;
  createExclusionList(listId: number, campaignId: number): Promise<number>;
  setExcludedContacts(listId: number, ids: number[]): Promise<void>;
  target(id: number, listId: number, exclusionListId: number): Promise<void>;
  send(id: number): Promise<void>;
}
export interface SheetPort {
  issues(): Promise<IssueRow[]>;
  sync(id: number, outcome: string): Promise<void>;
}
export interface StorePort {
  selection(id: number, listId: number): Promise<RecipientSelection>;
  setSelection(id: number, listId: number, contactId: number, included: boolean, revision: number): Promise<void>;
  setExclusionList(id: number, listId: number, exclusionListId: number): Promise<void>;
  lock(scope: string, operation: string): Promise<string>;
  unlock(scope: string, token: string): Promise<void>;
  approval(id: number): Promise<Approval | null>;
  begin(approval: Omit<Approval, "approvedAt" | "sheetSynced">): Promise<void>;
  outcome(id: number, outcome: ApprovalOutcome, detail?: string): Promise<void>;
  synced(id: number): Promise<void>;
  log(actor: string, operation: string, target: string, outcome: string): Promise<void>;
}
