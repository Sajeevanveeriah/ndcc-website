#!/usr/bin/env node
// Dino Coach round scoring: squad carry-forward selection (pure) plus source
// guards for the admin scoring route and its replace-scores migration.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectScoringSquads } from '../lib/dino-coach/round-scoring.ts';

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
// Drafts never score; an unfinished draft for this round falls back to the last submitted squad.
assert.deepEqual(ids(selectScoringSquads([squad('f2', 'f', 'w2', 'draft'), squad('f1', 'f', 'w1', 'locked')], target('w2', 2))), ['f:f1']);
assert.deepEqual(selectScoringSquads([squad('g1', 'g', 'w1', 'draft')], target('w2', 2)), []);
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
console.log('PASS round scoring: exact round, carry-forward, legacy fallback, drafts, other seasons, ties');

const route = read('app/api/admin/fantasy/scores/route.ts');
assert.match(route, /selectScoringSquads\(/, 'Scoring uses the tested carry-forward selection');
assert.doesNotMatch(route, /round_id\.eq\.\$\{roundId\},round_id\.is\.null/, 'Scoring no longer limits squads to this round or null');
assert.match(route, /That round is not part of the selected season\./, 'Round must belong to the season');
assert.match(route, /\.from\('fantasy_rounds'\)\.select\('id, round_number, name, season_id'\)\.eq\('season_id', season\.id\)/, 'GET round list is season filtered');
assert.equal((route.match(/return scoringErrorResponse\(error,/g) || []).length, 2, 'GET and POST both return friendly JSON errors');
assert.match(route, /rpc\('replace_dino_coach_round_scores'/, 'Recalculation replaces rows atomically');
assert.match(route, /isMissingFunction\(replaced\.error\)/, 'Falls back when the migration is not applied yet');
assert.match(route, /\.delete\(\)\.eq\('season_id', seasonId\)\.eq\('round_id', roundId\)/, 'Fallback removes stale rows');
console.log('PASS scores route: season checks, friendly errors, atomic replace with fallback');

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
