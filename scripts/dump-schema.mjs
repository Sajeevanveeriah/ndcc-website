#!/usr/bin/env node
// Snapshot the live database schema (no data) into supabase/schema.sql so the
// schema can be reviewed/diffed alongside supabase/migrations/.
//
// Requires the Supabase CLI (https://supabase.com/docs/guides/cli) and a
// database connection string in SUPABASE_DB_URL (or DATABASE_URL), e.g. the
// "Session pooler" URI from Supabase -> Project Settings -> Database.
//
//   SUPABASE_DB_URL='postgresql://...' npm run db:dump-schema
//   npm run db:dump-schema -- --dry-run     # print the command only
//
// Read-only against the database (pg_dump --schema-only). Not run in CI: CI
// has no production credentials and must never connect to production.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(repoRoot, 'supabase', 'schema.sql');
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';
const dryRun = process.argv.includes('--dry-run');

const args = ['db', 'dump', '--schema-only', '--db-url', dbUrl || '<SUPABASE_DB_URL>', '--file', outFile];
const printable = ['supabase', ...args.map((a) => (a === dbUrl && dbUrl ? '<redacted>' : a))].join(' ');

if (dryRun) {
  console.log(`[dry-run] ${printable}`);
  process.exit(0);
}
if (!dbUrl) {
  console.error('Set SUPABASE_DB_URL (or DATABASE_URL) to the database connection string. Nothing was run.');
  process.exit(1);
}

console.log(`Running: ${printable}`);
const result = spawnSync('supabase', args, { stdio: 'inherit', cwd: repoRoot });
if (result.error) {
  console.error(`Could not run the Supabase CLI: ${result.error.message}. Install it or run via "npx supabase".`);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Schema written to ${path.relative(repoRoot, outFile)}. Review the diff before committing.`);
