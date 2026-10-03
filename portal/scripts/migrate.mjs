import { neon } from '@neondatabase/serverless';
import { readFile } from 'node:fs/promises';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const sql = neon(process.env.DATABASE_URL);
const source = await readFile(new URL('../migrations/001_portal.sql', import.meta.url), 'utf8');
const statements = source.split(';').map(s => s.trim()).filter(Boolean);
await sql.transaction(statements.map(statement => sql.query(statement, [])));
console.log('Additive portal migration complete.');
