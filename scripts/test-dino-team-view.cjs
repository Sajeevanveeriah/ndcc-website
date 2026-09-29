// Viewing other Dino Coach teams: reveal rule, pick ordering, compare logic,
// and the route's sign-in, fairness, privacy and payload behaviour.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
class NextResponse extends Response { static json(body, init) { return new Response(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } }); } }
function load(file, mocks) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, console, Request, Response, Headers, URL, Date, Promise, require(name) { if (name in mocks) return mocks[name]; if (name.startsWith('./')) return load(path.resolve(path.dirname(file), name + '.ts'), mocks); if (name.startsWith('@/')) return load(path.resolve(name.slice(2) + '.ts'), mocks); return require(name); } }, { filename: file });
  return exports;
}
const view = load('lib/dino-coach/team-view.ts', { './player-stats': {} });

// 1. Locked round: only a closed round or an open one past its deadline fixes squads.
const now = Date.parse('2026-10-05T00:00:00Z');
const R = (id, n, status, deadline) => ({ id, name: `Round ${n}`, round_number: n, status, deadline_at: deadline });
assert.equal(view.latestLockedRound([R('r1', 1, 'open', '2026-10-10T00:00:00Z')], now), null, 'future deadline: nothing locked');
assert.equal(view.latestLockedRound([R('r1', 1, 'open', null)], now), null, 'open round without deadline is not locked');
assert.equal(view.latestLockedRound([R('r1', 1, 'draft', '2026-10-01T00:00:00Z')], now), null, 'draft rounds never lock');
assert.equal(view.latestLockedRound([R('r1', 1, 'open', '2026-10-03T01:00:00Z'), R('r2', 2, 'open', '2026-10-10T00:00:00Z')], now).id, 'r1', 'deadline passed locks that round even while the next is open');
assert.equal(view.latestLockedRound([R('r1', 1, 'scored', null), R('r2', 2, 'locked', null), R('r3', 3, 'open', '2026-10-17T00:00:00Z')], now).id, 'r2', 'latest closed round wins');
for (const status of ['completed', 'archived']) assert.equal(view.seasonFinished(status), true);
for (const status of ['draft', 'upcoming', 'active']) assert.equal(view.seasonFinished(status), false);
const source = fs.readFileSync('app/api/fantasy/managers/[managerId]/team/route.ts', 'utf8');
assert.doesNotMatch(source, /getRoundLockState|team_selection_open|public_launch_enabled/, 'weekly window and committee switches never reveal teams');

// 2. Picks follow the slot layout (XI then bench) and survive players leaving the pool.
const slots = [{ key: 'XI_BAT_1', label: 'Batter 1', positionType: 'starter', order: 1 }, { key: 'XI_BOWL_1', label: 'Bowler 1', positionType: 'starter', order: 2 }, { key: 'BENCH_BAT_1', label: 'Bench Batter', positionType: 'bench', order: 3 }];
const row = (player_id, slot_key, extra = {}) => ({ player_id, slot_key, assigned_role: 'BAT', position_type: slot_key.startsWith('BENCH') ? 'bench' : 'starter', is_captain: false, is_vice_captain: false, purchase_price_dino_dollars: '1000', fantasy_players: { display_name: `Joined ${player_id}` }, ...extra });
const players = new Map([['p1', { id: 'p1', display_name: 'Alex', role: 'BAT', team_label: null, price_dino_dollars: 1500, published_at: '2026-09-01' }], ['p2', { id: 'p2', display_name: 'Blake', role: 'BOWL', team_label: null, price_dino_dollars: 2000, published_at: '2026-09-01' }]]);
const picks = view.buildTeamPicks([row('p3', 'BENCH_BAT_1'), row('p2', 'XI_BOWL_1', { is_vice_captain: true }), row('p1', 'XI_BAT_1', { is_captain: true })], slots, players);
assert.deepEqual(picks.map(p => p.slotKey), ['XI_BAT_1', 'XI_BOWL_1', 'BENCH_BAT_1']);
assert.equal(picks[0].isCaptain, true); assert.equal(picks[1].isViceCaptain, true);
assert.equal(picks[0].purchasePriceDinoDollars, 1000); assert.equal(picks[0].slotLabel, 'Batter 1');
assert.equal(picks[2].player, null); assert.equal(picks[2].displayName, 'Joined p3', 'departed player keeps their saved name');
assert.equal(view.squadMarketValue(picks), 3500, 'value counts published prices of players still in the pool');
const other = view.buildTeamPicks([row('p2', 'XI_BAT_1'), row('p9', 'XI_BOWL_1')], slots, players);
assert.deepEqual([...view.sharedPlayerIds(picks, other)], ['p2']);

// 3. Route behaviour with mocked data.
const me = { id: '11111111-1111-4111-8111-111111111111', team_name: 'Mine XI', display_name: 'Me' };
const rivalId = '22222222-2222-4222-8222-222222222222';
let authed, season, rounds, managerRow, demoRow, squads, calls;
const squad = (id, manager_id, round_id, created_at, picks) => ({ id, manager_id, round_id, status: 'submitted', created_at, fantasy_squad_players: picks });
const reset = () => {
  authed = true; calls = [];
  season = { id: 'season-1', name: '2026/27', slug: '2026-27', is_current: true, status: 'active' };
  // Round 1 deadline passed; round 2 open with a future deadline (the weekly window may be open or shut).
  rounds = [R('r1', 1, 'open', '2026-01-03T01:00:00Z'), R('r2', 2, 'open', '2099-01-01T00:00:00Z')];
  managerRow = { id: rivalId, display_name: 'Rival', team_name: 'Rival XI', is_active: true, deleted_at: null, hidden_at: null };
  demoRow = { is_demo: false };
  squads = {
    // Newest first, as the route orders them: live round-2 edits, then the locked round-1 squad.
    [rivalId]: [squad('rv2', rivalId, 'r2', '2026-01-05', [row('p9', 'XI_BAT_1')]), squad('rv1', rivalId, 'r1', '2026-01-01', [row('p1', 'XI_BAT_1', { is_captain: true }), row('p2', 'XI_BOWL_1')])],
    [me.id]: [squad('me2', me.id, 'r2', '2026-01-05', [row('p2', 'XI_BAT_1')])],
  };
};
const thenable = result => ({ then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) });
const db = { from(table) { const filters = {}; const q = {
  select: () => q, in: () => q,
  eq: (k, v) => { filters[k] = v; return table === 'fantasy_rounds' ? Object.assign(thenable({ data: rounds, error: null }), q) : q; },
  order: () => table === 'fantasy_squads' ? Object.assign(thenable({ data: squads[filters.manager_id] ?? [], error: null }), q) : q,
  maybeSingle: async () => {
    calls.push(table);
    if (table === 'fantasy_managers') return { data: managerRow, error: null };
    if (table === 'fantasy_entries') return { data: demoRow, error: null };
    throw new Error(`Unexpected table ${table}`);
  },
}; if (table === 'fantasy_squads') calls.push(table); return q; } };
const scoring = load('lib/dino-coach/round-scoring.ts', {});
const route = load('app/api/fantasy/managers/[managerId]/team/route.ts', {
  'next/server': { NextResponse },
  '@/lib/fantasy-manager-auth': { resolveFantasyManagerAuth: async () => authed ? { auth: { manager: me } } : { auth: null, errorMessage: 'Please sign in to continue.', errorStatus: 401 } },
  '@/lib/supabase-server': { createServerClient: () => db },
  '@/lib/fantasy-seasons': { resolveRequestSeason: async () => season },
  '@/lib/fantasy-game': { getActivePlayersWithLatestPrices: async () => [...players.values()] },
  '@/lib/dino-coach/domain': { buildSquadSlots: () => slots },
  '@/lib/dino-coach/server': { getDinoCoachSettings: async () => ({ slot_counts: {} }) },
  '@/lib/dino-coach/player-stats-server': { getPlayerStats: async () => new Map([['p1', { runs: 120 }]]) },
  '@/lib/dino-coach/round-scoring': scoring,
  '@/lib/server/dino-public-cache': { getCachedManagerStandings: async () => [{ managerId: rivalId, rank: 2, totalPoints: 88, squadValueDinoDollars: 999999 }] },
  '@/lib/server/request-guards': { enforceRateLimit: async () => true, getClientIp: () => 'test' },
  '@/lib/server/public-errors': { logRouteError: () => {} },
  '@/lib/validation/uuid': { isUuidV1ToV5: value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) },
  '@/lib/dino-coach/team-view': view,
});
const get = (id = rivalId) => route.GET(new Request(`https://example.invalid/api/fantasy/managers/${id}/team`), { params: Promise.resolve({ managerId: id }) });
(async () => {
  reset(); authed = false;
  assert.equal((await get()).status, 401, 'signed-in managers only');
  reset();
  assert.equal((await get('not-a-uuid')).status, 404);

  reset(); rounds = [R('r1', 1, 'open', '2099-01-01T00:00:00Z')];
  const hidden = await get();
  assert.equal(hidden.status, 403, 'before the first deadline rivals are hidden');
  assert.equal((await hidden.json()).error, view.TEAMS_HIDDEN_MESSAGE);
  assert.ok(!calls.includes('fantasy_squads'), 'no squad is read while hidden');
  assert.equal((await get(me.id)).status, 200, 'your own team is always visible');

  // The key fairness case: round 1 locked, round 2 open. The rival's live round-2 edits (p9) stay hidden.
  reset();
  const response = await get();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  const body = await response.json();
  assert.deepEqual(body.team.picks.map(p => p.playerId), ['p1', 'p2'], 'rival shown with the locked round-1 squad');
  assert.ok(!JSON.stringify(body.team).includes('p9'), 'live edits for the open round never leak');
  assert.equal(body.team.roundName, 'Round 1');
  assert.equal(body.team.squadValueDinoDollars, 3500, 'value is of the squad shown, not the live squad');
  assert.equal(body.team.rank, 2); assert.equal(body.team.totalPoints, 88);
  assert.deepEqual(body.team.picks.map(p => [p.displayName, p.isCaptain, p.purchasePriceDinoDollars]), [['Alex', true, 1000], ['Blake', false, 1000]]);
  assert.equal(body.team.picks[0].player.stats.runs, 120);
  assert.equal(body.mine.teamName, 'Mine XI'); assert.equal(body.mine.roundName, null, 'your side is your live squad');
  assert.deepEqual(body.mine.picks.map(p => p.playerId), ['p2']);
  assert.ok(!JSON.stringify(body).includes('email'), 'no manager contact details in the payload');

  // A rival who has not touched round 2 carries their round-1 squad forward, as in scoring.
  reset(); squads[rivalId] = [squads[rivalId][1]];
  assert.deepEqual((await (await get()).json()).team.picks.map(p => p.playerId), ['p1', 'p2']);
  // No squad at or before the locked round.
  reset(); squads[rivalId] = [squads[rivalId][0]];
  assert.equal((await get()).status, 404, 'a squad saved only for the open round is never shown');
  // A finished season shows the squad for its latest locked round, not one saved for a round that never locked.
  reset(); season = { ...season, is_current: false, status: 'completed' };
  const finished = await (await get()).json();
  assert.deepEqual(finished.team.picks.map(p => p.playerId), ['p1', 'p2'], 'cancelled open round squad is not shown');
  assert.equal(finished.team.roundName, 'Round 1');
  // Only with no locked round at all does a finished season fall back to the newest squad.
  reset(); season = { ...season, is_current: false, status: 'completed' }; rounds = [];
  const noRounds = await (await get()).json();
  assert.deepEqual(noRounds.team.picks.map(p => p.playerId), ['p9']); assert.equal(noRounds.team.roundName, null);

  for (const change of [{ hidden_at: '2026-09-01' }, { deleted_at: '2026-09-01' }, { is_active: false }]) {
    reset(); Object.assign(managerRow, change);
    assert.equal((await get()).status, 404, JSON.stringify(change));
  }
  reset(); demoRow = { is_demo: true };
  assert.equal((await get()).status, 404, 'demo teams stay private');

  // Standings and private leagues link team names to the team view; demo league rows are not linked.
  assert.match(fs.readFileSync('app/fantasy/manager-leaderboard/page.tsx', 'utf8'), /href=\{`\/fantasy\/managers\/\$\{row\.managerId\}\$\{seasonQuery\}`\}/);
  const leagues = fs.readFileSync('app/fantasy/_components/LeaguesClient.tsx', 'utf8');
  assert.match(leagues, /row\.isDemo \? row\.teamName : <Link href=\{`\/fantasy\/managers\/\$\{row\.managerId\}/);
  assert.match(fs.readFileSync('app/api/fantasy/leagues/route.ts', 'utf8'), /isDemo: demoIds\.has\(row\.managerId\)/);
  assert.match(fs.readFileSync('app/fantasy/managers/[managerId]/page.tsx', 'utf8'), /robots: \{ index: false, follow: false \}/);
  console.log('PASS: Dino team view locked-round selection, carry-forward, live-edit privacy, slot order, compare, value, sign-in, privacy exclusions, demo links and payload.');
})().catch(error => { console.error(error); process.exit(1); });
