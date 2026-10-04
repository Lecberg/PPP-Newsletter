import { neon } from '@neondatabase/serverless';
import { readFile, readdir } from 'node:fs/promises';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const sql = neon(process.env.DATABASE_URL);
const directory = new URL('../migrations/', import.meta.url);
for (const file of (await readdir(directory)).filter(f => /^\d+.*\.sql$/.test(f)).sort()) {
  const source = await readFile(new URL(file, directory), 'utf8');
  const statements = source.split(';').map(s => s.trim()).filter(Boolean);
  await sql.transaction(statements.map(statement => sql.query(statement, [])));
  console.log('Applied: ' + file);
}
console.log('Additive portal migration complete.');
