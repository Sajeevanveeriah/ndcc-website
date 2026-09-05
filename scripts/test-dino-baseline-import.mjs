import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BASELINE_IMPORT_COLUMNS,
  buildDinoBaselineImportPreview,
} from '../lib/dino-coach/baseline-import.ts';

const roster = [
  { id: 'p1', displayName: 'Saj Veeriah', playhqPlayerId: null, isInternational: false },
  { id: 'p2', displayName: 'Alex Smith', playhqPlayerId: 'playhq-alex', isInternational: false },
  { id: 'p3', displayName: 'International Guest', playhqPlayerId: null, isInternational: true },
];

const csv = (rows) => [BASELINE_IMPORT_COLUMNS.join(','), ...rows].join('\n');

const test = (name, fn) => {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
};

test('accepts complete auditable baseline coverage and calculates exact averages', () => {
  const result = buildDinoBaselineImportPreview(csv([
    'Saj Veeriah,playhq-saj,verified_playhq,2,165,PlayHQ season export row 10',
    'Alex Smith,playhq-alex,verified_no_prior_appearance,0,0,Checked all relevant NDCC grades',
    'International Guest,,international_premium,0,0,No manual international baseline supplied',
  ]), roster);
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.validRows, 3);
  assert.equal(result.summary.coveredPlayers, 3);
  assert.equal(result.summary.missingPlayers, 0);
  assert.equal(result.rows[0].priorAveragePoints, 82.5);
  assert.equal(result.rows[0].identityDecision, 'unique_normalised_name');
  assert.equal(result.rows[1].identityDecision, 'stable_id');
});

test('refuses an ambiguous exact-name match instead of silently linking it', () => {
  const result = buildDinoBaselineImportPreview(csv([
    'Alex Smith,playhq-new,verified_playhq,1,10,PlayHQ export',
  ]), [...roster, { id: 'p4', displayName: 'Alex Smith', playhqPlayerId: null, isInternational: false }]);
  assert.match(result.rows[0].errors.join(' '), /ambiguous/i);
  assert.equal(result.rows[0].playerId, null);
});

test('uses a stable PlayHQ ID before names and rejects conflicting IDs', () => {
  const stable = buildDinoBaselineImportPreview(csv([
    'A. Smith,playhq-alex,verified_playhq,1,10,PlayHQ export',
  ]), roster);
  assert.equal(stable.rows[0].playerId, 'p2');
  assert.equal(stable.rows[0].identityDecision, 'stable_id');

  const conflict = buildDinoBaselineImportPreview(csv([
    'Alex Smith,different-id,verified_playhq,1,10,PlayHQ export',
  ]), roster);
  assert.match(conflict.rows[0].errors.join(' '), /conflicts with the existing stable PlayHQ ID/i);
});

test('rejects duplicate players and duplicate source IDs', () => {
  const result = buildDinoBaselineImportPreview(csv([
    'Saj Veeriah,shared-id,verified_playhq,1,10,PlayHQ export',
    'Saj Veeriah,other-id,verified_playhq,1,10,PlayHQ export',
    'Alex Smith,shared-id,verified_playhq,1,10,PlayHQ export',
  ]), roster);
  assert.match(result.rows[1].errors.join(' '), /duplicate roster player/i);
  assert.match(result.rows[2].errors.join(' '), /duplicate PlayHQ player ID/i);
});

test('enforces evidence and status-specific appearance rules', () => {
  const result = buildDinoBaselineImportPreview(csv([
    'Saj Veeriah,,verified_playhq,0,0,',
    'Alex Smith,playhq-alex,verified_no_prior_appearance,1,10,Checked grades',
    'International Guest,,international_manual,0,0,Manual source',
  ]), roster);
  assert.match(result.rows[0].errors.join(' '), /PlayHQ player ID/i);
  assert.match(result.rows[0].errors.join(' '), /source reference/i);
  assert.match(result.rows[1].errors.join(' '), /zero appearances/i);
  assert.match(result.rows[2].errors.join(' '), /at least one appearance/i);
});

test('rejects domestic and international status mismatches', () => {
  const result = buildDinoBaselineImportPreview(csv([
    'Saj Veeriah,,international_premium,0,0,No baseline',
    'International Guest,playhq-int,verified_playhq,1,20,PlayHQ export',
  ]), roster);
  assert.match(result.rows[0].errors.join(' '), /domestic player/i);
  assert.match(result.rows[1].errors.join(' '), /international player/i);
});

test('ships an atomic service-role-only baseline publication contract', () => {
  const migration = readFileSync('supabase/migrations/20260821052544_dino_coach_baseline_import.sql', 'utf8');
  assert.match(migration, /create table if not exists fantasy_baseline_import_batches/i);
  assert.match(migration, /create table if not exists fantasy_baseline_import_rows/i);
  assert.match(migration, /create or replace function publish_dino_coach_baseline_import/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /revoke all on function publish_dino_coach_baseline_import\(uuid,text\)/i);
  assert.match(migration, /grant execute on function publish_dino_coach_baseline_import\(uuid,text\) to service_role/i);
  assert.match(migration, /top 15/i);
  assert.match(migration, /cheapest 15/i);
});

test('exposes committee template, preview and apply controls in the existing reconciliation area', () => {
  const route = readFileSync('app/api/admin/fantasy/baseline-import/route.ts', 'utf8');
  const page = readFileSync('app/admin/fantasy/reconciliation/page.tsx', 'utf8');
  assert.match(route, /requirePermission\('fantasy\.review'\)/);
  assert.match(route, /createHash\('sha256'\)/);
  assert.match(route, /publish_dino_coach_baseline_import/);
  assert.match(route, /baseline-template\.csv/);
  assert.match(page, /Prior-season price evidence/);
  assert.match(page, /Download roster template/);
  assert.match(page, /Apply reviewed price evidence/);
  assert.doesNotMatch(page, /Historical evidence runs|Create review run|Create read-only run/);
});

test('allows CMS recalculation from the latest applied audited baseline', () => {
  const pricing = readFileSync('lib/dino-coach/pricing.ts', 'utf8');
  assert.match(pricing, /fantasy_baseline_import_batches/);
  assert.match(pricing, /status','applied'/);
  assert.match(pricing, /dino-baseline-import-v1/);
  assert.match(pricing, /rpc\('recalculate_dino_coach_applied_baseline'/);
  assert.doesNotMatch(pricing, /for\s*\(const item of calculated\)/,
    'Baseline recalculation must not perform partial per-player writes from application code.');
  const migration = readFileSync('supabase/migrations/20260821054404_dino_coach_atomic_baseline_recalculation.sql', 'utf8');
  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path = ''/i);
  assert.match(migration, /GRANT EXECUTE[\s\S]*TO service_role/i);
});

test('uses atomic database contracts for PlayHQ price application and publication', () => {
  const pricing = readFileSync('lib/dino-coach/pricing.ts', 'utf8');
  assert.match(pricing, /rpc\('apply_dino_coach_initial_price_recalculation'/);
  assert.match(pricing, /rpc\('publish_dino_coach_initial_prices'/);
  assert.doesNotMatch(pricing, /from\('fantasy_player_prices'\)\.update\(\{published_at:now\}\)/);
  const migration = readFileSync('supabase/migrations/20260821054657_dino_coach_atomic_price_operations.sql', 'utf8');
  assert.match(migration, /create or replace function public\.apply_dino_coach_initial_price_recalculation/i);
  assert.match(migration, /create or replace function public\.publish_dino_coach_initial_prices/i);
  assert.match(migration, /SECURITY DEFINER SET search_path = ''/i);
  const conflictIndex = readFileSync('supabase/migrations/20260821054754_dino_coach_price_conflict_index.sql', 'utf8');
  assert.match(conflictIndex, /NULLS NOT DISTINCT/i);
  const typeFix = readFileSync('supabase/migrations/20260821054848_dino_coach_price_recent_points_type_fix.sql', 'utf8');
  assert.match(typeFix, /ARRAY\[\]::NUMERIC\[\]/i);
  assert.match(typeFix, /recalculate_dino_coach_applied_baseline/);
  assert.match(typeFix, /apply_dino_coach_initial_price_recalculation/);
  const caseFix = readFileSync('supabase/migrations/20260821054945_dino_coach_price_recent_points_case_fix.sql', 'utf8');
  assert.match(caseFix, /regexp_replace/);
  assert.match(caseFix, /ARRAY\[\]::NUMERIC\[\]/i);
  const timestampFix = readFileSync('supabase/migrations/20260821055045_dino_coach_price_calculation_timestamp_fix.sql', 'utf8');
  assert.match(timestampFix, /calculated_at/);
  assert.match(timestampFix, /regexp_replace/);
});

console.log('Dino Coach baseline import suite passed.');
