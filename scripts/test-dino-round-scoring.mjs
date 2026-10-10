#!/usr/bin/env node
// Dino Coach round scoring: squad carry-forward selection (pure) plus source
// guards for the admin scoring route and its replace-scores migration.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBenchCover, selectScoringSquads } from '../lib/dino-coach/round-scoring.ts';
import vm from 'node:vm';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const roundNumbers = new Map([['w1', 1], ['w2', 2], ['w3', 3], ['other-season', null]]);
const target = (roundId, roundNumber) => ({ roundId, roundNumber, roundNumbers });
const squad = (id, manager_id, round_id, status = 'submitted', created_at = '2026-10-01T00:00:00Z') => ({ id, manager_id, round_id, status, created_at });
const ids = (rows) => rows.map((row) => `${row.manager_id}:${row.id}`);

// Exact round wins over carry-forward and legacy.
assert.deepEqual(ids(selectScoringSquads([squad('a1', 'a', 'w1'), squad('a2', 'a', 'w2'), squad('a0', 'a', null)], target('w2', 2))), ['a:a2']);
// No squad for this round: most recent earlier round carries forward.
assert.deepEqual(ids(selectScoringSquads([squad('b1', 'b', 'w1'), squad('b2', 'b', 'w2')], target('w3', 3))), ['b:b2']);
// Earlier round beats a legacy round-less squad.
assert.deepEqual(ids(selectScoringSquads([squad('c0', 'c', null, 'submitted', '2026-10-09T00:00:00Z'), squad('c1', 'c', 'w1')], target('w2', 2))), ['c:c1']);
// Legacy round-less squad still scores when nothing else exists (previous behaviour).
assert.deepEqual(ids(selectScoringSquads([squad('d0', 'd', null)], target('w2', 2))), ['d:d0']);
// Later rounds never score an earlier round.
assert.deepEqual(selectScoringSquads([squad('e3', 'e', 'w3')], target('w2', 2)), []);
// Every team is locked at the deadline as saved, drafts included: this round's draft scores.
assert.deepEqual(ids(selectScoringSquads([squad('f2', 'f', 'w2', 'draft'), squad('f1', 'f', 'w1', 'locked')], target('w2', 2))), ['f:f2']);
// A draft from an earlier round carries forward like a submitted squad.
assert.deepEqual(ids(selectScoringSquads([squad('g1', 'g', 'w1', 'draft')], target('w2', 2))), ['g:g1']);
// Unknown statuses are ignored.
assert.deepEqual(selectScoringSquads([squad('g9', 'g', 'w2', 'archived')], target('w2', 2)), []);
// Rounds outside this season (unknown number) are ignored.
assert.deepEqual(selectScoringSquads([squad('h9', 'h', 'other-season'), squad('h8', 'h', 'missing')], target('w2', 2)), []);
// Round with no number: exact and legacy only.
assert.deepEqual(ids(selectScoringSquads([squad('i1', 'i', 'w1'), squad('i0', 'i', null)], { roundId: 'x', roundNumber: null, roundNumbers })), ['i:i0']);
// Ties on the same earlier round prefer the newest row.
assert.deepEqual(ids(selectScoringSquads([squad('j-old', 'j', 'w1', 'submitted', '2026-10-01T00:00:00Z'), squad('j-new', 'j', 'w1', 'submitted', '2026-10-02T00:00:00Z')], target('w2', 2))), ['j:j-new']);
// One squad per manager, deterministic order, plain-object round map supported.
const many = selectScoringSquads([squad('z1', 'z', 'w1'), squad('a1', 'a', 'w1'), squad('m2', 'm', 'w2')], { roundId: 'w2', roundNumber: 2, roundNumbers: { w1: 1, w2: 2 } });
assert.deepEqual(ids(many), ['a:a1', 'm:m2', 'z:z1']);
assert.deepEqual(selectScoringSquads([], target('w1', 1)), []);
console.log('PASS round scoring: exact round, carry-forward, legacy fallback, drafts count, other seasons, ties');

// Bench cover: an empty playing slot takes the bench player of the same role.
const counts = { BAT: 4, AR: 2, WK: 1, BOWL: 4 };
const pick = (player_id, position_type, assigned_role, extra = {}) => ({ player_id, position_type, assigned_role, ...extra });
const fullXI = [...['b1', 'b2', 'b3', 'b4'].map((id) => pick(id, 'starter', 'BAT')), pick('a1', 'starter', 'AR'), pick('a2', 'starter', 'AR'), pick('w1', 'starter', 'WK'), ...['o1', 'o2', 'o3', 'o4'].map((id) => pick(id, 'starter', 'BOWL'))];
const bench = [pick('bb', 'bench', 'BAT', { is_captain: true }), pick('ba', 'bench', 'AR'), pick('bw', 'bench', 'WK'), pick('bo', 'bench', 'BOWL')];
let cover = applyBenchCover([...fullXI, ...bench], counts);
assert.equal(cover.starters.length, 11, 'A full XI keeps the bench out');
assert.deepEqual(cover.promoted, []);
cover = applyBenchCover([...fullXI.filter((p) => p.player_id !== 'b4'), ...bench], counts);
assert.deepEqual(cover.promoted.map((p) => p.player_id), ['bb'], 'Missing batter replaced by the bench batter');
assert.equal(cover.starters.length, 11);
assert.equal(cover.promoted[0].is_captain, false, 'A promoted bench player never carries leadership');
cover = applyBenchCover([...fullXI.filter((p) => p.player_id !== 'b4' && p.player_id !== 'b3'), ...bench], counts);
assert.deepEqual(cover.promoted.map((p) => p.player_id), ['bb'], 'Only one bench batter can cover two missing batters');
assert.equal(cover.starters.length, 10);
cover = applyBenchCover([...fullXI.filter((p) => p.player_id !== 'w1'), pick('bb', 'bench', 'BAT')], counts);
assert.deepEqual(cover.promoted, [], 'A bench batter never covers the wicket-keeper slot');
cover = applyBenchCover([pick('bo', 'bench', 'BOWL')], counts);
assert.deepEqual(cover.promoted.map((p) => p.player_id), ['bo'], 'Sparse drafts still use bench cover');
console.log('PASS bench cover: same-role promotion only into empty slots, no leadership, full XI unchanged');

// Round scoring lives in lib/dino-coach/round-scores.ts, shared by the admin
// route and the PlayHQ sync; check the route and the module together.
const route = read('app/api/admin/fantasy/scores/route.ts') + read('lib/dino-coach/round-scores.ts');
assert.match(route, /selectScoringSquads\(/, 'Scoring uses the tested carry-forward selection');
assert.match(route, /applyBenchCover</, 'Scoring applies bench cover before counting points');
assert.doesNotMatch(route, /round_id\.eq\.\$\{roundId\},round_id\.is\.null/, 'Scoring no longer limits squads to this round or null');
assert.match(route, /That round is not part of the selected season\./, 'Round must belong to the season');
assert.match(route, /\.from\('fantasy_rounds'\)\.select\('id, round_number, name, season_id'\)\.eq\('season_id', season\.id\)/, 'GET round list is season filtered');
assert.equal((route.match(/return scoringErrorResponse\(error,/g) || []).length, 2, 'GET and POST both return friendly JSON errors');
assert.match(route, /rpc\('replace_dino_coach_round_scores'/, 'Recalculation replaces rows atomically');
assert.match(route, /isMissingFunction\(replaced\.error\)/, 'Falls back when the migration is not applied yet');
assert.match(route, /\.delete\(\)\.eq\('season_id', seasonId\)\.eq\('round_id', roundId\)/, 'Fallback removes stale rows');
console.log('PASS scores route: season checks, friendly errors, atomic replace with fallback');
// Automatic round scoring: a resumable catch-up after every season's import.
const catchupSource = read('lib/playhq/orchestrator/round-scores-catchup.ts');
const catchup = { exports: {} };
vm.runInNewContext(ts.transpileModule(catchupSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports: catchup.exports, module: catchup, require: () => ({}) });
const roundsNeedingScores = (...args) => [...catchup.exports.roundsNeedingScores(...args)];
const stat = (round_id, changed_at, published_at = null) => ({ round_id, changed_at, published_at });
assert.deepEqual(roundsNeedingScores([stat('r2', '2026-10-10T08:00:00Z'), stat('r2', '2026-10-10T08:00:00Z'), stat('r1', '2026-10-10T08:00:00Z'), stat(null, '2026-10-10T08:00:00Z')], []), ['r1', 'r2'], 'rounds with stats but no scores are scored');
assert.deepEqual(roundsNeedingScores([stat('r1', '2026-10-10T08:00:00Z'), stat('r2', '2026-10-10T08:00:00Z')], [{ round_id: 'r1', calculated_at: '2026-10-10T09:00:00Z' }, { round_id: 'r2', calculated_at: '2026-10-10T07:00:00Z' }]), ['r2'], 'only rounds scored before their newest stat change are re-scored');
assert.deepEqual(roundsNeedingScores([stat('r1', '2026-10-01T08:00:00Z', '2026-10-10T08:30:00Z')], [{ round_id: 'r1', calculated_at: '2026-10-10T08:00:00Z' }]), ['r1'], 'publishing an older stat re-scores its round');
assert.deepEqual(roundsNeedingScores([stat('r1', '2026-10-10T08:00:00Z'), stat('r2', '2026-10-10T08:00:00Z')], [{ round_id: 'r1', calculated_at: '2026-10-10T09:00:00Z' }, { round_id: 'r2', calculated_at: '2026-10-10T09:00:01Z' }]), [], 'scored rounds stay settled however often the season syncs');
assert.doesNotMatch(catchupSource, /last_playhq_sync_at/, 'the daily-advancing season sync stamp is not the watermark');
assert.match(catchupSource, /fetchAllPages<any>\(\(from, to\) => supabase\.from\('fantasy_match_stats'\)/, 'stat rounds are read page by page');
assert.match(catchupSource, /if \(deadline - Date\.now\(\) < MIN_ROUND_BUDGET_MS\) break;/, 'stops before the time budget; remaining rounds resume next run');
assert.match(read('lib/playhq/fantasy-orchestrator.ts'), /const scoring = await catchUpRoundScores\(supabase, season, deadline\);/, 'every orchestrator run catches up round scores');
const stampMigration = read(`supabase/migrations/${readdirSync(join(root, 'supabase/migrations')).find((file) => file.endsWith('_dino_stats_changed_at.sql'))}`);
assert.match(stampMigration, /new\.status = 'published' and \(tg_op = 'INSERT' or old\.status is distinct from 'published'\)/, 'publishing a batch stamps published_at');
assert.match(stampMigration, /before insert or update on public\.fantasy_match_stats/, 'every stat write stamps changed_at');
console.log('PASS round scores catch up after publishing, resumably');

const migrationName = readdirSync(join(root, 'supabase/migrations')).find((file) => file.endsWith('_dino_round_score_replace.sql'));
assert.ok(migrationName, 'Replace-scores migration exists');
const migration = read(`supabase/migrations/${migrationName}`);
assert.match(migration, /^-- Rollback:/m);
assert.match(migration, /^begin;$/m);
assert.match(migration, /set local lock_timeout = '3s';/);
assert.match(migration, /security definer\s+set search_path = ''/);
assert.match(migration, /revoke all on function public\.replace_dino_coach_round_scores\(uuid, uuid, jsonb\) from public, anon, authenticated;/);
assert.match(migration, /grant execute on function public\.replace_dino_coach_round_scores\(uuid, uuid, jsonb\) to service_role;/);
assert.match(migration, /delete from public\.fantasy_manager_round_scores/);
assert.match(migration, /on conflict \(manager_id, season_id, round_id\) do update/);
console.log('PASS replace-scores migration: transactional, locked down, removes stale rows');
