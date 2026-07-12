import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, '..');
const tmpDir = join(scriptsDir, '.fantasy-reconciliation-tmp');
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(join(tmpDir, 'playhq'), { recursive: true });

function stage(relPath) {
  const source = readFileSync(join(repoRoot, 'lib', relPath), 'utf8')
    .replace(/from '\.\/playhq\/fantasy-import'/g, "from './playhq/fantasy-import.ts'")
    .replace(/from '\.\/types'/g, "from './types.ts'");
  const out = join(tmpDir, relPath.endsWith('.ts') ? relPath : `${relPath}.ts`);
  writeFileSync(out, source);
}

stage('fantasy-historical-reconciliation.ts');
stage('playhq/fantasy-import.ts');
writeFileSync(join(tmpDir, 'playhq/types.ts'), 'export type PlayHQFixture = { id: string; gradeId: string; gradeName: string; homeTeam: string; awayTeam: string; startsAt: string | null; venue: string | null; status: string | null; homeScore?: string | null; awayScore?: string | null; playHQUrl?: string | null };\n');

const { reconcileLegacyStat, summariseReconciliation, buildMigrationPreview } = await import(pathToFileURL(join(tmpDir, 'fantasy-historical-reconciliation.ts')).href);

const legacy = {
  id: '11111111-1111-1111-1111-111111111111',
  player_id: '22222222-2222-2222-2222-222222222222',
  player_name: 'Alex Batter',
  match_date: '2026-01-10',
  opponent: 'Geelong West',
  round_number: 7,
  runs: 42,
  wickets: 1,
  catches: 2,
  runouts: 0,
  stumpings: 0,
  ducks: 0,
  maidens: 1,
  playhq_player_id: 'phq-player-1',
};
const fixture = {
  gameId: 'game-1',
  fixtureId: 'fixture-1',
  sourceUrl: 'https://www.playhq.com/game-1',
  fetchedAt: '2026-07-12T00:00:00.000Z',
  sourcePayload: { id: 'game-1' },
  roundNumber: 7,
  roundName: 'Round 7',
  matchDate: '2026-01-10T03:00:00Z',
  opponent: 'Geelong West Cricket Club',
  players: [{ playhq_player_id: 'phq-player-1', display_name: 'Alex Batter', team_name: 'Newcomb', runs: 42, wickets: 1, catches: 2, runouts: 0, stumpings: 0, ducks: 0, maidens: 1, not_out: false, player_of_match: false }],
};

const exact = reconcileLegacyStat(legacy, [fixture]);
assert.equal(exact.classification, 'exact_match');
assert.equal(exact.confidence, 1);
assert.ok(exact.sourceHash);

const nameOnly = reconcileLegacyStat({ ...legacy, playhq_player_id: null }, [fixture]);
assert.equal(nameOnly.classification, 'probable_match_requires_review');
assert.equal(nameOnly.reviewStatus, 'pending');

const conflict = reconcileLegacyStat({ ...legacy, runs: 41 }, [fixture]);
assert.equal(conflict.classification, 'conflicting_statistics');
assert.deepEqual(conflict.diff.runs, { legacy: 41, playhq: 42 });
assert.equal(conflict.predictedFantasyScoreDelta, 1);

const ambiguousFixture = reconcileLegacyStat(legacy, [fixture, { ...fixture, gameId: 'game-2' }]);
assert.equal(ambiguousFixture.classification, 'ambiguous_fixture');

const missing = reconcileLegacyStat({ ...legacy, opponent: 'Unknown Opponent' }, [fixture]);
assert.equal(missing.classification, 'no_source_data');

const summary = summariseReconciliation([exact, nameOnly, conflict, missing]);
assert.equal(summary.exact, 1);
assert.equal(summary.requiresReview, 3);

const preview = buildMigrationPreview('run-1', [exact, nameOnly]);
assert.match(preview.sql, /classification = 'exact_match'/);
assert.doesNotMatch(preview.sql, /22222222-2222-2222-2222-222222222222/);

const migration = readFileSync(join(repoRoot, 'supabase/migrations/20260712090000_fantasy_historical_reconciliation.sql'), 'utf8');
assert.match(migration, /fantasy_historical_reconciliation_rows/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /USING \(FALSE\)/);

rmSync(tmpDir, { recursive: true, force: true });
console.log('Fantasy historical reconciliation checks passed.');
