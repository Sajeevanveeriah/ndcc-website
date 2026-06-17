#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n').filter((f) => /\.(tsx?|jsx?|json)$/.test(f) && !f.startsWith('app/admin/') && !f.startsWith('components/admin/'));
const paths = new Set();
const re = /['"`]((?:\/images|\/downloads)\/[A-Za-z0-9][^'"`\s<>{}|\\^]*)['"`]/g;

function normalizePublicPath(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed) || trimmed.includes('YYYY')) return null;
  if (trimmed.startsWith('/images/cms/')) return trimmed.replace(/^\/images\/cms\//, '/images/');
  if (trimmed.startsWith('/images/') || trimmed.startsWith('/downloads/')) return trimmed;
  if (trimmed.startsWith('images/')) return `/${trimmed}`;
  if (trimmed.startsWith('downloads/')) return `/${trimmed}`;
  if (trimmed.startsWith('public/images/') || trimmed.startsWith('public/downloads/')) return trimmed.replace(/^public\//, '/');
  return null;
}

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(re)) {
    const assetPath = normalizePublicPath(m[1]);
    if (assetPath) paths.add(assetPath);
  }
}

async function addDatabaseAssetPaths() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { checked: false, reason: 'Supabase env not present.' };

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const checks = [
    ['sponsors', 'logo_url,banner_url'],
    ['news', 'image_url'],
    ['events', 'image_url'],
    ['gallery_images', 'image_url'],
    ['season_appointments', 'image_url'],
    ['committee_members', 'image_url'],
  ];
  const errors = [];

  for (const [table, select] of checks) {
    const { data, error } = await supabase.from(table).select(select).limit(1000);
    if (error) {
      errors.push({ table, code: error.code, message: error.message });
      continue;
    }
    for (const row of data || []) {
      for (const value of Object.values(row)) {
        const assetPath = normalizePublicPath(value);
        if (assetPath) paths.add(assetPath);
      }
    }
  }

  return { checked: true, errors };
}

const dbResult = await addDatabaseAssetPaths();
const missing = [...paths].filter((path) => !existsSync(join('public', path)));
if (missing.length) {
  console.error('Missing public assets:');
  for (const path of missing.sort()) console.error(`- ${path}`);
  if (dbResult.checked && dbResult.errors.length) console.error(`Database image path scan had ${dbResult.errors.length} table error(s).`);
  process.exit(1);
}

console.log(`Checked ${paths.size} public asset references.`);
console.log(dbResult.checked ? `Database image path scan completed with ${dbResult.errors.length} table error(s).` : `Database image path scan skipped: ${dbResult.reason}`);
