import { GoogleAuth } from 'google-auth-library';
import { neon } from '@neondatabase/serverless';
let failed = false;
const keys = ['AUTH_SECRET', 'AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET', 'PORTAL_ALLOWED_EMAILS', 'PORTAL_OWNER_EMAIL', 'AUTH_URL', 'BREVO_API_KEY', 'BREVO_LIST_ID', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'GOOGLE_SHEET_ID', 'DATABASE_URL'];
for (const key of keys) if (!process.env[key]) { console.log('Missing: ' + key); failed = true; }
const addresses = (process.env.PORTAL_ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
if (addresses.length !== 2 || new Set(addresses).size !== 2 || !addresses.includes(process.env.PORTAL_OWNER_EMAIL?.toLowerCase())) { console.log('Check the two allowed accounts and the owner account.'); failed = true; }
async function check(label, work) {
  try { await work(); console.log(label + ': ready'); }
  catch { console.log(label + ': needs setup or could not be reached'); failed = true; }
}
if (process.env.BREVO_API_KEY && process.env.BREVO_LIST_ID) await check('Brevo', async () => {
  const headers = { 'api-key': process.env.BREVO_API_KEY };
  const list = await fetch('https://api.brevo.com/v3/contacts/lists/' + process.env.BREVO_LIST_ID, { headers, signal: AbortSignal.timeout(15000) });
  if (!list.ok) throw new Error('List unavailable');
  const fields = await fetch('https://api.brevo.com/v3/contacts/attributes', { headers, signal: AbortSignal.timeout(15000) });
  if (!fields.ok || !(await fields.json()).attributes.some(a => a.name === 'NEWSLETTER_NAME' && a.type === 'text' && a.category === 'normal')) throw new Error('Name field unavailable');
});
if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_SHEET_ID) await check('Google Sheets', async () => {
  const auth = new GoogleAuth({ credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON), scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const token = await (await auth.getClient()).getAccessToken();
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + process.env.GOOGLE_SHEET_ID + '/values/Issues!A1:AZ', { headers: { Authorization: 'Bearer ' + token.token }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Sheet unavailable');
  const rows = (await response.json()).values;
  if (!['brevo_campaign_id', 'approval_status', 'issue_date', 'newsletter_subject'].every(h => rows?.[0]?.includes(h))) throw new Error('Missing headers');
});
if (process.env.DATABASE_URL) await check('Neon database and migration', async () => {
  const sql = neon(process.env.DATABASE_URL);
  const [row] = await sql`SELECT to_regclass('portal_approvals') IS NOT NULL AND to_regclass('portal_locks') IS NOT NULL AND to_regclass('portal_operations') IS NOT NULL AS ready`;
  if (!row.ready) throw new Error('Migration needed');
});
console.log('Delivery switch: ' + (process.env.PORTAL_SEND_ENABLED === 'true' ? 'enabled' : 'disabled'));
process.exitCode = failed ? 1 : 0;
