#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TABLES = {
  sponsors: { key: ['name'] },
  content_blocks: { key: ['block_key'] },
  page_link_cards: { key: ['page_slug', 'section_key', 'title', 'href'] },
  club_settings: { key: ['id'] },
  committee_members: { key: ['name', 'role'] },
  season_appointments: { key: ['name', 'role'] },
  teams: { key: ['name'] },
  facility_features: { key: ['title'] },
  news: { key: ['title', 'published_at'] },
  events: { key: ['title', 'date'] },
  gallery_images: { key: ['title', 'image_url'] },
  volunteer_positions: { key: ['title'] },
  social_membership_plans: { key: ['name'] },
  social_membership_addons: { key: ['name'] },
};

const NEVER_UPDATE = new Set(['id', 'created_at', 'updated_at']);
const INVALID_URL_VALUES = new Set(['', '#', 'null', 'undefined']);
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split('=');
  return [key.replace(/^--/, ''), rest.length ? rest.join('=') : 'true'];
}));
const dryRun = args.get('apply') !== 'true';
const evidencePath = args.get('evidence');
if (!evidencePath) throw new Error('Missing --evidence=path/to/june16-export.json');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function isEmptyOrInvalid(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return INVALID_URL_VALUES.has(value.trim().toLowerCase());
  return false;
}
function evidenceFields(record) {
  return record && typeof record === 'object' && record.fields && typeof record.fields === 'object'
    ? record.fields
    : record;
}
function manualReviewNote(record) {
  return record && typeof record === 'object' && typeof record.notes === 'string' && record.notes.trim()
    ? record.notes.trim()
    : null;
}
function cleanRecord(record) {
  return Object.fromEntries(Object.entries(evidenceFields(record)).filter(([key]) => !NEVER_UPDATE.has(key)));
}
function keyFilter(query, keyColumns, record) {
  for (const column of keyColumns) query = query.eq(column, record[column]);
  return query;
}
async function tableExists(table) {
  const { error } = await supabase.from(table).select('*').limit(1);
  return !error || error.code !== '42P01';
}
async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + 999);
    if (error) throw new Error(`${table} backup failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}
async function main() {
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join('backups', `june16-cms-restore-${stamp}`);
  await mkdir(backupDir, { recursive: true });
  const summary = [];

  for (const [table, config] of Object.entries(TABLES)) {
    const sourceRows = Array.isArray(evidence[table]) ? evidence[table] : [];
    if (sourceRows.length === 0) continue;
    if (!(await tableExists(table))) {
      summary.push({ table, skipped: 'table_missing', evidence: sourceRows.length });
      continue;
    }
    await writeFile(path.join(backupDir, `${table}.json`), JSON.stringify(await fetchAll(table), null, 2));
    let inserts = 0, updates = 0, unchanged = 0, manualReview = 0;
    for (const evidenceRow of sourceRows) {
      const source = cleanRecord(evidenceRow);
      if (manualReviewNote(evidenceRow)) manualReview++;
      if (config.key.some((column) => isEmptyOrInvalid(source[column]))) {
        throw new Error(`${table} evidence row is missing natural key ${config.key.join(', ')}`);
      }
      const { data: current, error } = await keyFilter(supabase.from(table).select('*'), config.key, source).maybeSingle();
      if (error) throw new Error(`${table} lookup failed: ${error.message}`);
      const payload = source;
      if (!current) {
        if (!dryRun) {
          const { error: insertError } = await supabase.from(table).insert(payload);
          if (insertError) throw new Error(`${table} insert failed: ${insertError.message}`);
        }
        inserts++;
        continue;
      }
      const patch = {};
      for (const [column, value] of Object.entries(payload)) {
        if (config.key.includes(column)) continue;
        if (isEmptyOrInvalid(current[column]) && !isEmptyOrInvalid(value)) patch[column] = value;
      }
      if (Object.keys(patch).length) {
        if (!dryRun) {
          const { error: updateError } = await keyFilter(supabase.from(table).update(patch), config.key, source);
          if (updateError) throw new Error(`${table} update failed: ${updateError.message}`);
        }
        updates++;
      } else unchanged++;
    }
    summary.push({ table, evidence: sourceRows.length, inserts, updates, unchanged, skipped: 0, manualReview });
  }
  await writeFile(path.join(backupDir, 'summary.json'), JSON.stringify({ dryRun, evidencePath, summary }, null, 2));
  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'apply', backupDir, destructiveOperations: false, deletes: 0, truncates: 0, deactivations: 0, summary }, null, 2));
}
main().catch((error) => { console.error(error.message); process.exit(1); });
