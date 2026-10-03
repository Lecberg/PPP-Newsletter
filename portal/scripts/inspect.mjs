import { neon } from '@neondatabase/serverless';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const sql = neon(process.env.DATABASE_URL);
console.table(await sql`SELECT scope, operation, acquired_at FROM portal_locks`);
console.table(await sql`SELECT campaign_id, outcome, approved_at, updated_at, sheet_synced FROM portal_approvals ORDER BY approved_at DESC LIMIT 20`);
