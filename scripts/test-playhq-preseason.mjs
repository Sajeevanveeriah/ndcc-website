import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';

function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (name) => { if (!(name in imports)) throw Error(name); return imports[name]; }, Date, Map, Set, Number, Math, RegExp, URL, console, setTimeout });
  return exports;
}
const importer = load('lib/playhq/fantasy-import.ts', { 'node:crypto': crypto });
const normalise = load('lib/playhq/normalise.ts');
const publicSeason = load('lib/playhq/season-match.ts');
const seasonOptions = [{ id: 'old', name: 'Summer 2025/26' }, { id: 'mapped', name: 'Senior cricket' }, { id: 'current', name: 'Summer 2026/27' }];
assert.deepEqual(publicSeason.currentPublicSeasons(seasonOptions, '2026-27', 'mapped').map(s => s.id), ['mapped', 'current']);
assert.deepEqual(publicSeason.currentPublicSeasons(seasonOptions, '2026-27', 'old').map(s => s.id), ['current']);
assert.deepEqual(publicSeason.currentPublicSeasons(seasonOptions, '2026-27').map(s => s.id), ['current']);
const clubLink = 'https://www.playhq.com/cricket-australia/org/newcomb/2c2bff9c';
assert.equal(publicSeason.currentSeasonPlayHQUrl(`${clubLink}/summer-202526/teams/first/id`, '2026-27', clubLink), clubLink);
assert.equal(publicSeason.currentSeasonPlayHQUrl(`${clubLink}/summer-202627/teams/first/id`, '2026-27', clubLink), `${clubLink}/summer-202627/teams/first/id`);
assert.equal(publicSeason.currentSeasonPlayHQUrl(clubLink, '2026-27', clubLink), clubLink);
const season = { id: 'season', name: 'Dino Coach 2026/2027', slug: '2026-27', playhq_season_id: 'phq', auto_sync_enabled: true };
let fixtures = [];
const inserted = {};
function db() { return { from: (table) => {
  let fields = '', update;
  const q = { select: (value) => { fields = value; return q; }, eq: () => q, order: () => q, update: (value) => { update = value; return q; },
    insert: (value) => { inserted[table] = value; return q; },
    maybeSingle: async () => ({ data: season }),
    single: async () => {
      if (table === 'fantasy_seasons') { Object.assign(season, update); return { data: Object.fromEntries(fields.split(',').map(x => x.trim()).map(x => [x, season[x]])) }; }
      return { data: { id: table, ...inserted[table] } };
    },
    then: (resolve) => resolve({ data: table === 'fantasy_seasons' ? [Object.fromEntries(fields.split(',').map(x => x.trim()).map(x => [x, season[x]]))] : [{ playhq_grade_id: 'grade', grade_name: 'GCA 4 1st XI', enabled: true }] }),
  }; return q;
} }; }
const sync = load('lib/playhq/fantasy-sync.ts', {
  'server-only': {}, '@/lib/supabase-server': { createServerClient: db }, '@/lib/dino-coach/domain': {},
  './client': { getPlayHQTeams: async () => [], getPlayHQGradeFixtureRaw: async () => ({ data: { items: fixtures } }) },
  './season-match': { isClubTeamName: name => /newcomb/i.test(name) }, './normalise': normalise, './fantasy-import': importer,
});
const fixture = (status = 'UPCOMING', id = 'game-1') => ({ id, status, round: { number: 1, name: 'Round 1' },
  schedule: { date: '2026-10-10' }, competitors: [{ isHomeTeam: true, name: 'Other Club' }, { isHomeTeam: false, name: 'Newcomb & District' }] });
async function preview(rows) { fixtures = rows; return sync.startFantasySyncJob({ seasonId: 'season', dryRun: true }); }
const homeAway = normalise.normaliseFixtures({ data: [fixture()] }, { id: 'grade', name: 'Test' })[0];
assert.equal(homeAway.homeTeam, 'Other Club'); assert.equal(homeAway.awayTeam, 'Newcomb & District');
const reversed = normalise.normaliseFixtures({ data: [{ ...fixture(), competitors: [...fixture().competitors].reverse() }] }, { id: 'grade', name: 'Test' })[0];
assert.equal(reversed.homeTeam, 'Other Club'); assert.equal(reversed.awayTeam, 'Newcomb & District');
let result = await preview(Array.from({ length: 56 }, (_, i) => fixture('UPCOMING', `game-${i}`)));
assert.equal(result.queued, 0); assert.equal(result.awaitingResults, 56); assert.equal(result.emptyQueueInvariantBreached, false); assert.equal(result.reviewItems.length, 0);
result = await sync.startFantasySyncJob({ seasonId: 'season' });
assert.equal(result.job.status, 'pending'); assert.equal(inserted.fantasy_sync_jobs.counts.awaiting_results, 56);
for (const status of ['SCHEDULED', 'IN_PROGRESS', 'POSTPONED', 'CANCELLED', 'ABANDONED', 'BYE']) {
  assert.equal((await preview([fixture(status)])).emptyQueueInvariantBreached, false, status);
}
result = await preview([fixture('FINALIZED')]); assert.equal(result.queued, 1); assert.equal(result.queuePreview[0].roundNumber, 1);
assert.equal((await preview([])).emptyQueueInvariantBreached, false);
assert.equal((await preview([fixture('MYSTERY')])).emptyQueueInvariantBreached, true);
assert.equal((await preview([{ status: 'UPCOMING' }])).emptyQueueInvariantBreached, true);
assert.equal((await preview([{ ...fixture(), competitors: [] }])).emptyQueueInvariantBreached, true);
result = await preview([{ status: 'UPCOMING', round: { number: 99 } }, { ...fixture('FINAL'), round: { number: 7, name: 'Round 7' } }]);
assert.equal(result.queuePreview[0].roundNumber, 7); assert.ok(result.reviewItems.some(x => x.type === 'fixture_payload'));
result = await preview([{ ...fixture('FINAL'), round: null }]); assert.ok(result.reviewItems.some(x => x.type === 'ambiguous_round'));
const recoverable = { status: 'needs_review', total_games: 0, processed_games: 0, failed_games: 0, review_items: [{ type: 'empty_queue' }] };
assert.equal(importer.canRetryEmptyFixtureJob(recoverable), true);
for (const changed of [{ processed_games: 1 }, { failed_games: 1 }, { total_games: 1 }, { review_items: [{ type: 'ambiguous_exact_name' }] }, { review_items: [] }]) {
  assert.equal(importer.canRetryEmptyFixtureJob({ ...recoverable, ...changed }), false);
}
const route = load('app/api/admin/fantasy/seasons/route.ts', {
  'next/server': { NextResponse: { json: body => body } }, '@/lib/auth/guard': { requirePermission: async () => ({ id: 'admin' }) },
  '@/lib/supabase-server': { createServerClient: db }, '@/lib/fantasy-seasons': { SEASON_COLUMNS: 'id, name' },
  '@/lib/playhq/client': {}, '@/lib/playhq/config': {},
});
for (const enabled of [false, true]) {
  const saved = await route.PATCH({ json: async () => ({ seasonId: 'season', autoSyncEnabled: enabled }) });
  assert.equal(saved.season.auto_sync_enabled, enabled);
  const reloaded = await route.GET({ url: 'https://example.test/api/admin/fantasy/seasons' });
  assert.equal(reloaded.seasons[0].auto_sync_enabled, enabled);
}
console.log('Preseason fixture classification, safe recovery eligibility, round alignment and Auto Sync save/reload checks passed.');
