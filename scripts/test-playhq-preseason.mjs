import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';

function load(path, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (name) => { if (!(name in imports)) throw Error(name); return imports[name]; }, Date, Map, Set, Number, Math, RegExp, URL, console, setTimeout, clearTimeout, AbortController, ...globals });
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

// Exercise the actual public client against provider responses: empty grade
// endpoints must not hide current club fixtures across multiple competitions.
let failedTeam = false;
const requested = [];
const publicClient = load('lib/playhq/client.ts', {
  'server-only': {}, 'next/cache': { unstable_cache: fn => fn },
  '@/lib/club-seasons': { getCurrentClubSeason: async () => ({ slug: '2026-27', name: '2026/2027' }) },
  './season-match': publicSeason, './normalise': normalise,
  // No saved PlayHQ mappings: the automatic discovery path is exercised.
  './mapping': load('lib/playhq/mapping.ts', { './season-match': publicSeason }), './mapping-store': { loadPlayHQMappings: async () => null },
  './config': { LEGACY_BASE_URL: 'https://legacy.example.invalid', getPlayHQConfig: () => ({
    configured: true, apiKey: 'test-fixture', organisationId: 'club', tenant: 'ca',
    baseUrl: 'https://api.example.invalid', defaultGradeIds: [], revalidateSeconds: 300,
  }) },
}, { fetch: async url => {
  const path = new URL(url).pathname; requested.push(path);
  let data;
  if (path.endsWith('/seasons')) data = [
    { id: 'empty', name: 'Summer 2026/27' }, { id: 'senior', name: 'Summer 2026/27' },
    { id: 'women', name: 'Summer 2026/27' }, { id: 'old', name: 'Summer 2025/26' },
  ];
  else if (path === '/v1/seasons/senior/teams') data = [
    { id: 'first', name: 'Newcomb 1st XI', gradeId: 'senior-grade', gradeName: 'First XI' },
    { id: 'other', name: 'Other club', gradeId: 'other-grade' },
  ];
  else if (path === '/v1/seasons/women/teams') data = [{ id: 'women-team', name: 'NDCC women', gradeId: 'women-grade' }];
  else if (path.endsWith('/teams') || path.endsWith('/grades')) data = [];
  else if (path === '/v1/teams/first/fixture') data = [fixture('UPCOMING', 'senior-game'), fixture('UPCOMING', 'senior-game')];
  else if (path === '/v1/teams/women-team/fixture') {
    if (failedTeam) return { ok: false, status: 503 };
    data = [fixture('UPCOMING', 'women-game')];
  } else return { ok: false, status: 404 };
  return { ok: true, json: async () => ({ data }) };
} });
let publicData = await publicClient.getPlayHQPublicDataUncached();
assert.equal(publicData.error, null);
assert.deepEqual([...publicData.fixtures.map(f => f.id)].sort(), ['senior-game', 'women-game']);
assert.equal(publicData.grades.length, 2);
assert.equal(publicData.teams.length, 2);
assert.ok(!requested.some(p => p.includes('/old/')));
assert.ok(publicData.warnings.some(w => w.includes('Ladder')));
failedTeam = true;
publicData = await publicClient.getPlayHQPublicDataUncached();
assert.deepEqual([...publicData.fixtures.map(f => f.id)], ['senior-game']);
assert.ok(publicData.warnings.some(w => w.includes('Fixtures')));
console.log('Public PlayHQ feed: current competitions, team evidence, duplicate games and partial provider failures passed.');

assert.equal(normalise.formatFixtureTime('2026-10-03'), '3 Oct 2026 - time TBC');
assert.equal(normalise.formatFixtureTime('2026-10-10'), '10 Oct 2026 - time TBC');
assert.match(normalise.formatFixtureTime('2026-10-03T03:00:00Z'), /1:00 pm/);
assert.match(normalise.formatFixtureTime('2026-10-10T03:00:00Z'), /2:00 pm/);
assert.equal(normalise.formatFixtureTime(null), 'Date TBC');
console.log('Date-only fixtures never invent a start time; explicit times respect Melbourne daylight saving.');
