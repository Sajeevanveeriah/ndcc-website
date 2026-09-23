#!/usr/bin/env node
// Generate Supabase TypeScript types for the database schema into
// lib/database.types.ts. Equivalent to:
//
//   supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > lib/database.types.ts
//
// Requires the Supabase CLI (https://supabase.com/docs/guides/cli), logged in
// (`supabase login` or SUPABASE_ACCESS_TOKEN) with access to the project, and
// the project ref in SUPABASE_PROJECT_ID (the subdomain of the Supabase URL).
//
//   SUPABASE_PROJECT_ID=<project-ref> npm run db:generate-types
//   npm run db:generate-types -- --dry-run     # print the command only
//
// Read-only against Supabase (schema introspection only). Not run in CI: CI
// has no production credentials and must never connect to production. The
// output file is only replaced when the CLI succeeds, so a failed run never
// leaves a truncated types file behind. Review the diff before committing.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(repoRoot, 'lib', 'database.types.ts');
const projectId = process.env.SUPABASE_PROJECT_ID || '';
const dryRun = process.argv.includes('--dry-run');

const args = ['gen', 'types', 'typescript', '--project-id', projectId || '<SUPABASE_PROJECT_ID>'];
const printable = `supabase ${args.join(' ')} > ${path.relative(repoRoot, outFile)}`;

if (dryRun) {
  console.log(`[dry-run] ${printable}`);
  process.exit(0);
}
if (!/^[a-z0-9]{20}$/.test(projectId)) {
  console.error('Set SUPABASE_PROJECT_ID to the 20-character Supabase project ref. Nothing was run.');
  process.exit(1);
}

console.log(`Running: ${printable}`);
const result = spawnSync('supabase', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (result.error) {
  console.error(`Could not run the Supabase CLI: ${result.error.message}. Install it or run via "npx supabase".`);
  process.exit(1);
}
if (result.status !== 0 || !result.stdout.trim()) {
  process.stderr.write(result.stderr || '');
  console.error('Type generation failed; lib/database.types.ts was not changed.');
  process.exit(result.status || 1);
}
writeFileSync(outFile, result.stdout);
console.log(`Types written to ${path.relative(repoRoot, outFile)}. Review the diff before committing.`);
