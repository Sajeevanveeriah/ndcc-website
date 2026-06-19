#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const execute = process.argv.includes('--execute');
const sponsors = JSON.parse(readFileSync('data/sponsors/verified-sponsors-20260619.json', 'utf8'));
const sponsorAliases = JSON.parse(readFileSync('data/sponsors/canonical-sponsor-aliases.json', 'utf8'));
const aliases = new Map();
function norm(value) { return String(value || '').toLowerCase().replace(/[’']/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim(); }
for (const [canonicalName, names] of Object.entries(sponsorAliases)) {
  aliases.set(norm(canonicalName), canonicalName);
  for (const name of names) aliases.set(norm(name), canonicalName);
}
function canonical(value) { return aliases.get(norm(value)) || String(value || '').trim(); }
function merge(existing, verified, sortOrder) {
  const next = { name: verified.display_name, active: true, sort_order: Number(existing?.sort_order || 0) || sortOrder };
  if (!existing?.website) next.website = verified.official_link;
  if (!existing?.logo_url) next.logo_url = verified.logo_local_path;
  if (!existing?.description) next.description = verified.description;
  if (!existing?.source_url) next.source_url = verified.text_source_url || verified.official_link || null;
  if (!existing?.logo_source_url) next.logo_source_url = verified.logo_source_url || null;
  if (!existing?.verified_at) next.verified_at = verified.retrieval_timestamp;
  if (!existing?.tier) next.tier = 'standard';
  if (!existing?.placement_type) next.placement_type = 'listing';
  return next;
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1);
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: existingRows, error } = await supabase.from('sponsors').select('*');
if (error) { console.error(error.message); process.exit(1); }
mkdirSync('tmp/production-backups', { recursive: true });
const backupPath = `tmp/production-backups/sponsors-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(backupPath, JSON.stringify(existingRows || [], null, 2));
console.log(`Backed up ${existingRows?.length || 0} sponsor rows to ${backupPath}`);
let inserted = 0, updated = 0, unchanged = 0, errors = 0;
const byName = new Map();
for (const row of existingRows || []) {
  const key = norm(canonical(row.name));
  if (!byName.has(key)) byName.set(key, row);
}
for (const [index, sponsor] of sponsors.entries()) {
  const existing = byName.get(norm(sponsor.display_name));
  const payload = merge(existing, sponsor, index + 1);
  if (!execute) { console.log(`${existing ? 'Would update' : 'Would insert'} ${sponsor.display_name}`); unchanged++; continue; }
  const result = existing
    ? await supabase.from('sponsors').update(payload).eq('id', existing.id)
    : await supabase.from('sponsors').insert(payload);
  if (result.error) { console.error(`${sponsor.display_name}: ${result.error.message}`); errors++; }
  else if (existing) updated++; else inserted++;
}
console.log(JSON.stringify({ inserted, updated, unchanged, errors, execute }, null, 2));
if (errors) process.exit(1);
