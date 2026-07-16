#!/usr/bin/env node
// Migration-history consistency check (CI-safe, no credentials required).
//
// Guards the invariants agreed in
// docs/operations/20260716-Migration-History-Reconciliation-Rev00.md:
//
// 1. Every remote-history version recorded in
//    supabase/remote-migration-history.json resolves to a file in
//    supabase/migrations/ — either a file whose name starts with that
//    version, or the documented `localFile` it was applied from.
// 2. Every SQL file in supabase/migrations/ is accounted for: it matches a
//    remote version, is listed as a documented `localFile`, is listed in
//    `localOnlyApplied` (pre-history files already live in production), or is
//    NEW work carrying a full 14-digit timestamp version strictly greater
//    than the newest recorded remote version.
// 3. No two files share a version prefix.
//
// Fails loudly on drift so an unrecorded migration can never slip through a
// pull request unnoticed.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const manifestPath = path.join(root, 'supabase', 'remote-migration-history.json');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

const errors = [];
const versionOf = (file) => {
  const match = file.match(/^(\d{8,14})[_.]/) || file.match(/^(\d{8,14})/);
  return match ? match[1] : null;
};

// 3. duplicate version prefixes. Pre-history files (localOnlyApplied) are
// grandfathered: several legitimately share day-level prefixes and are never
// pushed through the CLI. Everything else must be unique.
const grandfathered = new Set(manifest.localOnlyApplied || []);
const seen = new Map();
for (const file of files) {
  const version = versionOf(file);
  if (!version) {
    errors.push(`Cannot parse a version prefix from migration filename: ${file}`);
    continue;
  }
  if (grandfathered.has(file)) continue;
  if (seen.has(version)) {
    errors.push(`Duplicate migration version ${version}: ${seen.get(version)} and ${file}`);
  }
  seen.set(version, file);
}

// 1. every remote version resolves locally
const documentedLocalFiles = new Set();
for (const entry of manifest.versions) {
  const direct = files.find((f) => f.startsWith(`${entry.version}_`) || f === `${entry.version}.sql`);
  if (direct) continue;
  if (entry.localFile && files.includes(entry.localFile)) {
    documentedLocalFiles.add(entry.localFile);
    continue;
  }
  errors.push(
    `Remote migration ${entry.version} (${entry.name}) has no matching file in supabase/migrations/`
    + (entry.localFile ? ` and its documented localFile ${entry.localFile} is missing.` : '.')
  );
}
for (const entry of manifest.versions) {
  if (entry.localFile) documentedLocalFiles.add(entry.localFile);
}

// 2. every local file is accounted for
const remoteVersions = new Set(manifest.versions.map((v) => v.version));
const localOnly = new Set(manifest.localOnlyApplied || []);
const newestRemote = [...remoteVersions].sort().at(-1);

for (const file of files) {
  const version = versionOf(file);
  if (!version) continue;
  if (remoteVersions.has(version)) continue;
  if (documentedLocalFiles.has(file)) continue;
  if (localOnly.has(file)) continue;
  // New work: must be a full timestamp newer than the recorded history tip.
  if (!/^\d{14}$/.test(version)) {
    errors.push(
      `New migration ${file} must use a full YYYYMMDDhhmmss version (14 digits) so it sorts after the recorded remote history.`
    );
    continue;
  }
  if (version <= newestRemote) {
    errors.push(
      `New migration ${file} has version ${version}, which does not sort after the newest recorded remote version ${newestRemote}.`
    );
  }
}

if (errors.length > 0) {
  console.error('Migration history check FAILED:\n');
  for (const err of errors) console.error(`  - ${err}`);
  console.error(
    '\nIf a migration was genuinely applied to production, record it in supabase/remote-migration-history.json.'
    + '\nSee docs/operations/20260716-Migration-History-Reconciliation-Rev00.md for the reconciliation rules.'
  );
  process.exit(1);
}

console.log(
  `Migration history check passed: ${files.length} local migrations, `
  + `${manifest.versions.length} recorded remote versions, ${localOnly.size} documented pre-history files.`
);
