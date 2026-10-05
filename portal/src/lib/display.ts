export const statusLabel = (status: string) => ({
  draft: "Awaiting approval", submitting: "Outcome unknown", unknown: "Outcome unknown",
  submitted: "Submitted for sending", queued: "Submitted for sending", scheduled: "Submitted for sending",
  sent: "Sent", rejected: "Delivery request rejected", suspended: "Sending suspended", inProcess: "Sending in progress"
}[status] ?? status);
export function issueDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T00:00:00+08:00` : value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Hong_Kong" }).format(date);
}
export function approvalDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong" }).format(new Date(value)) + " HKT";
}
