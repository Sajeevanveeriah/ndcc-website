#!/usr/bin/env node
// WP7 PlayHQ mapping, team page and slug logic against the recorded public
// feed (scripts/fixtures/playhq-public-fixtures-20260926.json). No network:
// the client is exercised with a fake fetch built from the recording.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (name) => { if (!(name in imports)) throw Error(`unexpected import ${name}`); return imports[name]; }, Date, Map, Set, Number, Math, RegExp, URL, Intl, JSON, console, setTimeout, clearTimeout, AbortController, ...globals });
  return exports;
}

// vm results come from another realm; compare as plain JSON values.
const eq = (actual, expected, message) => assert.deepEqual(actual === undefined ? undefined : JSON.parse(JSON.stringify(actual)), expected, message);

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`  ok - ${name}`); }
async function testAsync(name, fn) { await fn(); passed += 1; console.log(`  ok - ${name}`); }

const recorded = JSON.parse(readFileSync('scripts/fixtures/playhq-public-fixtures-20260926.json', 'utf8'));
const seasonMatch = load('lib/playhq/season-match.ts');
const normalise = load('lib/playhq/normalise.ts');
const mapping = load('lib/playhq/mapping.ts', { './season-match': seasonMatch });
const slug = load('lib/playhq/team-slug.ts');
const view = load('lib/playhq/team-view.ts', { './season-match': seasonMatch, './team-slug': slug });

const MEN = '19591b3d-f4e6-4ab6-b13f-552f31b75b5d';
const WOMEN = '1b6c27bb-d578-41f0-a113-0ab2e5cc79aa';
const team = (suffix) => recorded.teams.find((row) => row.name === `Newcomb & District ${suffix}`);
const firsts = team('1sts');
const thirds = team('3rds');
const women1 = team('Women 1sts');
const women2 = team('Women 2nds');

test('recording has the verified seasons, grades and seven NDCC teams', () => {
  assert.equal(recorded.selectedSeasonId, MEN);
  eq(recorded.grades.map((g) => g.name), ['GCA 4 1st XI', 'GCA 4 2nd XI', 'Senior Women E Grade']);
  assert.equal(recorded.teams.length, 7);
  assert.equal(recorded.teams.filter((t) => !t.gradeId).length, 4);
});

test('recorded ids are full PlayHQ UUIDs', () => {
  for (const row of [...recorded.teams, ...recorded.grades]) assert.ok(mapping.isPlayHQUuid(row.id), row.id);
  assert.equal(mapping.isPlayHQUuid('27feb0a1'), false);
  assert.equal(mapping.isPlayHQUuid(null), false);
});

test('mapped mode only switches on with an enabled row', () => {
  assert.equal(mapping.hasActiveMappings(null), false);
  assert.equal(mapping.hasActiveMappings({ clubSeasonId: 'c', seasons: [], grades: [], teams: [] }), false);
  assert.equal(mapping.hasActiveMappings({ clubSeasonId: 'c', seasons: [{ playhqSeasonId: MEN, label: null, enabled: false }], grades: [], teams: [] }), false);
  assert.equal(mapping.hasActiveMappings({ clubSeasonId: 'c', seasons: [], grades: [], teams: [{ playhqTeamId: firsts.id, teamName: firsts.name, playhqGradeId: null, enabled: true }] }), true);
});

test('linked seasons replace automatic candidates; otherwise automatic ids are kept', () => {
  const set = { clubSeasonId: 'c', seasons: [{ playhqSeasonId: MEN, label: 'Men', enabled: true }, { playhqSeasonId: WOMEN, label: 'Women', enabled: true }, { playhqSeasonId: MEN, label: 'dupe', enabled: true }], grades: [], teams: [] };
  eq(mapping.mappedSeasonIds(set, ['other']), [MEN, WOMEN]);
  eq(mapping.mappedSeasonIds({ ...set, seasons: [] }, [MEN, MEN]), [MEN]);
});

const discovered = [
  { seasonId: MEN, teams: [...recorded.teams.filter((t) => !/Women/.test(t.name)), { id: '00000000-0000-4000-8000-000000000001', name: 'Guild St. Marys', gradeId: firsts.gradeId }], grades: recorded.grades.filter((g) => g.seasonId === MEN) },
  { seasonId: WOMEN, teams: recorded.teams.filter((t) => /Women/.test(t.name)), grades: recorded.grades.filter((g) => g.seasonId === WOMEN) },
];

test('team mappings are the source of truth and pick up newly allocated grades', () => {
  const set = { clubSeasonId: 'c', seasons: [], grades: [], teams: [
    { playhqTeamId: firsts.id, teamName: 'Saved name', playhqGradeId: null, enabled: true },
    { playhqTeamId: thirds.id, teamName: thirds.name, playhqGradeId: null, enabled: true },
    { playhqTeamId: women1.id, teamName: women1.name, playhqGradeId: women1.gradeId, enabled: true },
    { playhqTeamId: women2.id, teamName: women2.name, playhqGradeId: null, enabled: false },
  ] };
  const scope = mapping.selectMappedScope(set, discovered);
  eq(scope.teams.map((t) => t.id), [firsts.id, thirds.id, women1.id]);
  assert.equal(scope.teams[0].name, firsts.name, 'live PlayHQ name wins over the saved label');
  assert.equal(scope.teams[0].gradeId, firsts.gradeId, 'grade allocated after saving is picked up live');
  assert.equal(scope.teams[1].gradeId, null, 'ungraded team stays ungraded');
  eq(scope.grades.map((g) => [g.name, g.seasonId]), [['GCA 4 1st XI', MEN], ['Senior Women E Grade', WOMEN]]);
});

test('grade mappings limit grades while teams stay automatic (NDCC names only)', () => {
  const set = { clubSeasonId: 'c', seasons: [], teams: [], grades: [{ playhqGradeId: women1.gradeId, gradeName: 'Senior Women E Grade', enabled: true }] };
  const scope = mapping.selectMappedScope(set, discovered);
  assert.equal(scope.teams.length, 7);
  assert.ok(!scope.teams.some((t) => t.name === 'Guild St. Marys'));
  eq(scope.grades.map((g) => g.id), [women1.gradeId]);
});

test('mapped team missing from live discovery keeps its saved details', () => {
  const set = { clubSeasonId: 'c', seasons: [], grades: [{ playhqGradeId: firsts.gradeId, gradeName: 'GCA 4 1st XI', enabled: true }], teams: [{ playhqTeamId: firsts.id, teamName: 'Newcomb & District 1sts', playhqGradeId: firsts.gradeId, enabled: true }] };
  const scope = mapping.selectMappedScope(set, []);
  eq(scope.teams, [{ id: firsts.id, name: 'Newcomb & District 1sts', gradeId: firsts.gradeId, gradeName: 'GCA 4 1st XI' }]);
});

test('duplicate games merge and keep every NDCC team tag', () => {
  const game = { ...recorded.fixtures[0] };
  const merged = mapping.mergeFixtures([{ ...game, clubTeamIds: ['a'] }, { ...game, clubTeamIds: ['b'] }, { ...recorded.fixtures[1] }]);
  assert.equal(merged.length, 2);
  eq(merged[0].clubTeamIds, ['a', 'b']);
  assert.equal(merged[1].clubTeamIds, undefined);
});

test('admin payload accepts only full UUIDs and rejects duplicates', () => {
  const ok = mapping.parsePlayHQMappingPayload({
    seasons: [{ playhqSeasonId: MEN.toUpperCase(), label: ' Summer 2026/27  men ' }],
    grades: [{ playhqGradeId: firsts.gradeId, gradeName: 'GCA 4 1st XI' }],
    teams: [{ playhqTeamId: thirds.id, teamName: thirds.name, playhqGradeId: '' }],
    cmsTeamLinks: [{ teamId: 'cms-1', playhqTeamId: firsts.id }, { teamId: 'cms-2', playhqTeamId: null }],
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.seasons[0].playhqSeasonId, MEN);
  assert.equal(ok.value.seasons[0].label, 'Summer 2026/27 men');
  assert.equal(ok.value.teams[0].playhqGradeId, null);
  assert.equal(ok.value.cmsTeamLinks[1].playhqTeamId, null);
  assert.equal(mapping.parsePlayHQMappingPayload({ seasons: [{ playhqSeasonId: '19591b3d' }] }).ok, false);
  assert.equal(mapping.parsePlayHQMappingPayload({ grades: [{ playhqGradeId: firsts.gradeId, gradeName: '' }] }).ok, false);
  assert.equal(mapping.parsePlayHQMappingPayload({ teams: [{ playhqTeamId: firsts.id, teamName: 'a' }, { playhqTeamId: firsts.id, teamName: 'b' }] }).ok, false);
  assert.equal(mapping.parsePlayHQMappingPayload({ cmsTeamLinks: [{ teamId: 'x', playhqTeamId: 'not-a-uuid' }] }).ok, false);
  assert.equal(mapping.parsePlayHQMappingPayload(null).ok, true, 'an empty save clears mappings');
});

test('slugs are deterministic, readable and unique', () => {
  assert.equal(slug.slugifyTeamName('Women 1sts'), 'women-1sts');
  assert.equal(slug.slugifyTeamName('Newcomb & District 1sts'), 'newcomb-and-district-1sts');
  assert.equal(slug.slugifyTeamName("Women's 2nd XI"), 'womens-2nd-xi');
  assert.equal(slug.slugifyTeamName('  '), 'team');
  const slugs = slug.buildTeamSlugs([{ name: '1st XI' }, { name: '1st XI' }, { name: '1st  XI!' }, { name: 'Senior Women' }]).map((row) => row.slug);
  eq(slugs, ['1st-xi', '1st-xi-2', '1st-xi-3', 'senior-women']);
  eq(slug.buildTeamSlugs([{ name: '1st XI' }, { name: '1st XI' }]).map((r) => r.slug), slug.buildTeamSlugs([{ name: '1st XI' }, { name: '1st XI' }]).map((r) => r.slug));
});

test('CMS teams match PlayHQ teams by link, exact name or unique ordinal', () => {
  const teams = recorded.teams;
  assert.equal(view.matchPlayHQTeam({ name: '1st XI', grade: 'GCA 4' }, teams)?.id, firsts.id);
  assert.equal(view.matchPlayHQTeam({ name: '3rd XI' }, teams)?.id, thirds.id);
  assert.equal(view.matchPlayHQTeam({ name: "Women's 1sts" }, teams)?.id, women1.id);
  assert.equal(view.matchPlayHQTeam({ name: 'Newcomb & District 2nds' }, teams)?.name, 'Newcomb & District 2nds');
  assert.equal(view.matchPlayHQTeam({ name: 'Senior Women' }, teams), null, 'no ordinal: never guess between two women teams');
  assert.equal(view.matchPlayHQTeam({ name: 'Senior Women', grade: 'Women 2nds' }, teams)?.id, women2.id, 'grade text can identify the team');
  assert.equal(view.matchPlayHQTeam({ name: 'Anything', playhq_team_id: women2.id.toUpperCase() }, teams)?.id, women2.id);
  assert.equal(view.matchPlayHQTeam({ name: '1st XI', playhq_team_id: '00000000-0000-4000-8000-00000000abcd' }, teams), null, 'a saved link is never overridden by name matching');
  assert.equal(view.matchPlayHQTeam({ name: 'Under 12' }, teams), null);
});

test('team fixtures, next match and home/away from the recording', () => {
  const rows = view.fixturesForTeam(recorded.fixtures, firsts);
  const expected = recorded.fixtures.filter((f) => f.homeTeam === firsts.name || f.awayTeam === firsts.name).length;
  assert.equal(rows.length, expected);
  assert.ok(rows.length > 0);
  const { upcoming, results, next } = view.splitTeamFixtures(rows, new Date('2026-09-26T08:00:00Z'));
  assert.equal(results.length, 0);
  assert.equal(upcoming.length, rows.length);
  assert.equal(next.startsAt, '2026-10-03');
  eq(view.opponentFor(next, firsts), { opponent: 'Guild St. Marys', venueRole: 'Away' });
  assert.match(next.playHQUrl, /^https:\/\/www\.playhq\.com\/.+\/game-centre\//);
  // Game day in Melbourne: a date-only game stays upcoming on the day itself.
  const onDay = view.splitTeamFixtures(rows, new Date('2026-10-03T12:00:00Z'));
  assert.equal(onDay.next.startsAt, '2026-10-03');
  const after = view.splitTeamFixtures(rows, new Date('2026-10-03T14:30:00Z'));
  assert.equal(after.results[0].startsAt, '2026-10-03', 'after Melbourne midnight the game moves to results');
  assert.equal(view.fixturesForTeam(recorded.fixtures, thirds).length, 0, 'ungraded team has no fixtures');
});

test('tagged fixtures and completed status are respected', () => {
  const tagged = { ...recorded.fixtures[0], homeTeam: 'Newcomb 1st XI', awayTeam: 'Opponent', clubTeamIds: [firsts.id], status: 'FINAL', homeScore: '5/210', awayScore: '180' };
  assert.equal(view.fixtureInvolvesTeam(tagged, firsts), true);
  assert.equal(view.opponentFor(tagged, firsts).opponent, 'Opponent');
  assert.equal(view.splitTeamFixtures([{ ...tagged, startsAt: '2030-01-01' }], new Date('2026-09-26T00:00:00Z')).results.length, 1);
});

test('Melbourne date formatting never invents a start time', () => {
  assert.equal(view.formatFixtureDay('2026-10-03'), 'Sat 3 Oct 2026');
  assert.equal(view.formatFixtureStartTime('2026-10-03'), null);
  assert.equal(view.fixtureDayKey('2026-10-03T14:30:00Z'), '2026-10-04');
  assert.equal(view.formatFixtureDay('2026-10-03T14:30:00Z'), 'Sun 4 Oct 2026');
  assert.match(view.formatFixtureStartTime('2026-10-03T03:00:00Z'), /^1:00\s?pm$/i);
  assert.equal(view.formatFixtureDay(null), 'Date to be confirmed');
});

test('ladder rows are filtered to the grade and sorted', () => {
  const rows = normalise.normaliseLadder({ ladder: [{ team: { name: 'Teesdale 1st XI' }, rank: 2 }, { team: { name: firsts.name }, rank: 1 }, { rank: 3 }] }, { id: firsts.gradeId, name: 'GCA 4 1st XI' });
  const ladder = view.ladderForGrade([...rows, { gradeId: 'other', gradeName: 'x', teamName: 'y', position: 1, played: 0, points: 0 }], firsts.gradeId);
  eq(ladder.map((r) => r.teamName), [firsts.name, 'Teesdale 1st XI']);
  assert.equal(view.isLadderRowForTeam(ladder[0], firsts), true);
  eq(view.ladderForGrade(rows, null), []);
});

test('captain and coach come only from roles naming the team', () => {
  const appointments = [
    { name: 'Club Coach Person', role: 'Head Coach' },
    { name: 'Vice Person', role: '1st XI Vice Captain' },
    { name: 'First Captain', role: '1st XI Captain' },
    { name: 'Women Coach', role: 'Women 1sts Coach' },
    { name: 'Assistant', role: 'Assistant Coach 1st XI' },
  ];
  eq(view.appointmentsForTeam(appointments, { name: '1st XI' }), { captain: 'First Captain', coach: null });
  eq(view.appointmentsForTeam(appointments, { name: 'Senior Women' }, women1.name), { captain: null, coach: 'Women Coach' });
  eq(view.appointmentsForTeam(appointments, { name: '3rd XI' }), { captain: null, coach: null });
});

test('tab labels drop the club prefix only', () => {
  assert.equal(view.shortTeamLabel('Newcomb & District Women 1sts'), 'Women 1sts');
  assert.equal(view.shortTeamLabel('Newcomb and District Cricket Club 2nds'), '2nds');
  assert.equal(view.shortTeamLabel('Guild St. Marys'), 'Guild St. Marys');
});

// Exercise the real client in mapped and automatic mode with a fake fetch.
function fakeFetch(requested) {
  return async (url) => {
    const path = new URL(url).pathname;
    requested.push(path);
    let data;
    if (path.endsWith('/seasons')) data = recorded.seasons;
    else if (path === `/v1/seasons/${MEN}/teams`) data = discovered[0].teams;
    else if (path === `/v1/seasons/${WOMEN}/teams`) data = discovered[1].teams;
    else if (path === `/v1/seasons/${MEN}/grades`) data = discovered[0].grades;
    else if (path === `/v1/seasons/${WOMEN}/grades`) data = discovered[1].grades;
    else if (path.endsWith('/teams') || path.endsWith('/grades')) data = [];
    else if (path.startsWith('/v1/teams/') && path.endsWith('/fixture')) {
      const teamId = path.split('/')[3];
      const teamRow = recorded.teams.find((t) => t.id === teamId);
      data = recorded.fixtures.filter((f) => f.homeTeam === teamRow?.name || f.awayTeam === teamRow?.name)
        .map((f) => ({ id: f.id, status: f.status, url: f.playHQUrl, venue: { name: f.venue }, schedule: { date: f.startsAt }, competitors: [{ isHomeTeam: true, name: f.homeTeam }, { isHomeTeam: false, name: f.awayTeam }] }));
    } else return { ok: false, status: 404 };
    return { ok: true, json: async () => ({ data }) };
  };
}

function loadClient(mappings, requested) {
  return load('lib/playhq/client.ts', {
    'server-only': {}, 'next/cache': { unstable_cache: (fn) => fn },
    '@/lib/club-seasons': { getCurrentClubSeason: async () => ({ id: 'club-season', slug: '2026-27', name: '2026/2027 Season', playhq_season_id: null }) },
    './season-match': seasonMatch, './normalise': normalise, './mapping': mapping,
    './mapping-store': { loadPlayHQMappings: async (id) => { assert.equal(id, 'club-season'); return mappings; } },
    './config': { LEGACY_BASE_URL: 'https://legacy.example.invalid', getPlayHQConfig: () => ({ configured: true, apiKey: 'test-fixture', organisationId: 'club', tenant: 'ca', baseUrl: 'https://api.example.invalid', defaultGradeIds: [], revalidateSeconds: 300 }) },
  }, { fetch: fakeFetch(requested) });
}

await testAsync('client uses saved mappings (seasons, teams) when present', async () => {
  const requested = [];
  const client = loadClient({ clubSeasonId: 'club-season', seasons: [{ playhqSeasonId: WOMEN, label: 'Women', enabled: true }], grades: [], teams: [
    { playhqTeamId: women1.id, teamName: women1.name, playhqGradeId: women1.gradeId, enabled: true },
    { playhqTeamId: women2.id, teamName: women2.name, playhqGradeId: null, enabled: true },
  ] }, requested);
  const data = await client.getPlayHQPublicDataUncached();
  assert.equal(data.error, null);
  assert.equal(data.source, 'mapped');
  assert.equal(data.selectedSeasonId, WOMEN);
  eq(data.teams.map((t) => t.id), [women1.id, women2.id]);
  eq(data.grades.map((g) => g.id), [women1.gradeId]);
  const expected = recorded.fixtures.filter((f) => f.gradeId === women1.gradeId).length;
  assert.equal(data.fixtures.length, expected);
  assert.ok(data.fixtures.every((f) => f.clubTeamIds?.includes(women1.id)));
  assert.ok(!requested.some((p) => p.includes(MEN)), 'unlinked seasons are not requested');
  const usage = client.getPlayHQEndpointUsage();
  eq(usage.map((u) => [u.dataset, u.version]).filter(([d]) => d !== 'Grade ladder'), [['Organisation seasons', 'v1'], ['Season grades', 'v1'], ['Season teams', 'v1'], ['Team fixture', 'v1']]);
  assert.ok(!JSON.stringify(usage).includes(WOMEN), 'endpoint usage never exposes ids');
});

await testAsync('client keeps automatic discovery when no mapping is saved', async () => {
  const requested = [];
  const client = loadClient(null, requested);
  const data = await client.getPlayHQPublicDataUncached();
  assert.equal(data.error, null);
  assert.equal('source' in data, false);
  assert.equal(data.teams.length, 7);
  assert.equal(data.grades.length, 3);
  assert.equal(data.fixtures.length, recorded.fixtures.length);
  assert.ok(data.fixtures.every((f) => !('clubTeamIds' in f)), 'automatic output shape is unchanged');
});

test('routes, pages and admin wiring keep their contracts', () => {
  const read = (path) => readFileSync(path, 'utf8');
  const teamPage = read('app/teams/[slug]/page.tsx');
  assert.match(teamPage, /export const revalidate = 300;/);
  assert.match(teamPage, /export async function generateMetadata/);
  assert.match(teamPage, /notFound\(\)/);
  assert.match(teamPage, /Fixture not yet released by GCA/);
  assert.match(read('lib/server/sitemap-entries.ts'), /\/teams\/\$\{slug\}/);
  assert.match(read('app/teams/page.tsx'), /href=\{`\/teams\/\$\{slugs\.get\(team\)\}`\}/);
  assert.match(read('app/fixtures/page.tsx'), /FixturesTeamTabs/);
  const tabs = read('app/fixtures/_components/FixturesTeamTabs.tsx');
  for (const token of ['role="tablist"', 'role="tab"', 'role="tabpanel"', 'aria-selected', 'aria-controls', 'ArrowRight', 'Home', 'End']) assert.ok(tabs.includes(token), token);
  assert.match(read('app/admin/layout.tsx'), /href: '\/admin\/season\/playhq'/);
  const sync = read('app/api/admin/playhq/sync/route.ts');
  assert.match(sync, /refreshPlayHQPublicData\(\)/);
  const refresh = read('lib/playhq/refresh.ts');
  assert.match(refresh, /revalidateTag\('playhq'\)/);
  for (const path of ['/fixtures', '/teams', '/']) assert.ok(refresh.includes(`'${path}'`), path);
  assert.match(read('lib/playhq/client.ts'), /tags: \['playhq'\]/);
  const importStub = read('app/api/admin/playhq/import-public-page/route.ts');
  assert.match(importStub, /Configure PlayHQ source details before executing imports\./, 'import-public-page keeps its current response');
  for (const route of ['mappings', 'discover']) {
    const source = read(`app/api/admin/playhq/${route}/route.ts`);
    assert.match(source, /requirePermission\('season\.setup'\)/, route);
    assert.doesNotMatch(source, /PLAYHQ_API_KEY|x-api-key/, route);
  }
  const migration = read('supabase/migrations/20260927070000_playhq_season_links.sql');
  for (const token of ['create table if not exists public.club_season_playhq_seasons', 'enable row level security', 'revoke all on public.club_season_playhq_seasons from public, anon, authenticated', 'add column if not exists playhq_team_id', "set local lock_timeout = '3s'", 'Rollback:']) assert.ok(migration.includes(token), token);
});

console.log(`PlayHQ mapping, team page and slug checks passed (${passed}).`);
