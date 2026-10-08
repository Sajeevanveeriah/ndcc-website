// Dino Coach teams are private: the team view returns only the signed-in
// manager's own squad, and no page links to another manager's team.
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
for (const removed of ['latestLockedRound', 'seasonFinished', 'sharedPlayerIds', 'TEAMS_HIDDEN_MESSAGE']) assert.equal(view[removed], undefined, `${removed} is gone with rival team views`);

// 3. Route behaviour with mocked data.
const me = { id: '11111111-1111-4111-8111-111111111111', team_name: 'Mine XI', display_name: 'Me' };
const rivalId = '22222222-2222-4222-8222-222222222222';
let authed, season, squads, calls;
const squad = (id, manager_id, round_id, created_at, picks) => ({ id, manager_id, round_id, status: 'submitted', created_at, fantasy_squad_players: picks });
const reset = () => {
  authed = true; calls = [];
  season = { id: 'season-1', name: '2026/27', slug: '2026-27', is_current: true, status: 'active' };
  squads = {
    // Newest first, as the route orders them.
    [rivalId]: [squad('rv1', rivalId, 'r1', '2026-01-01', [row('p9', 'XI_BAT_1')])],
    [me.id]: [squad('me2', me.id, 'r2', '2026-01-05', [row('p1', 'XI_BAT_1', { is_captain: true }), row('p2', 'XI_BOWL_1')]), squad('me1', me.id, 'r1', '2026-01-01', [row('p2', 'XI_BAT_1')])],
  };
};
const thenable = result => ({ then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) });
const db = { from(table) {
  calls.push(table);
  if (table !== 'fantasy_squads') throw new Error(`Unexpected table ${table}`);
  const filters = {}; const q = {
    select: () => q, in: () => q,
    eq: (k, v) => { filters[k] = v; return q; },
    order: () => Object.assign(thenable({ data: squads[filters.manager_id] ?? [], error: null }), q),
  }; return q;
} };
let reads = 0;
const route = load('app/api/fantasy/managers/[managerId]/team/route.ts', {
  'next/server': { NextResponse },
  '@/lib/fantasy-manager-auth': { resolveFantasyManagerAuth: async () => authed ? { auth: { manager: me } } : { auth: null, errorMessage: 'Please sign in to continue.', errorStatus: 401 } },
  '@/lib/supabase-server': { createServerClient: () => db },
  '@/lib/fantasy-seasons': { resolveRequestSeason: async () => { reads += 1; return season; } },
  '@/lib/fantasy-game': { getActivePlayersWithLatestPrices: async () => [...players.values()] },
  '@/lib/dino-coach/domain': { buildSquadSlots: () => slots },
  '@/lib/dino-coach/server': { getDinoCoachSettings: async () => ({ slot_counts: {} }) },
  '@/lib/dino-coach/player-stats-server': { getPlayerStats: async () => new Map([['p1', { runs: 120 }]]) },
  '@/lib/dino-coach/round-scoring': load('lib/dino-coach/round-scoring.ts', {}),
  '@/lib/server/dino-public-cache': { getCachedManagerStandings: async () => [{ managerId: me.id, rank: 2, totalPoints: 88 }] },
  '@/lib/server/request-guards': { enforceRateLimit: async () => true, getClientIp: () => 'test' },
  '@/lib/server/public-errors': { logRouteError: () => {} },
  '@/lib/validation/uuid': { isUuidV1ToV5: value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) },
  '@/lib/dino-coach/team-view': view,
});
const get = (id = me.id) => route.GET(new Request(`https://example.invalid/api/fantasy/managers/${id}/team`), { params: Promise.resolve({ managerId: id }) });
(async () => {
  reset(); authed = false;
  assert.equal((await get()).status, 401, 'signed-in managers only');
  reset();
  assert.equal((await get('not-a-uuid')).status, 404);

  // Another manager's team is never returned, and answers exactly like a missing team before any data is read.
  for (const status of ['active', 'completed', 'archived']) {
    reset(); reads = 0; season = { ...season, status };
    const response = await get(rivalId);
    assert.equal(response.status, 404, `rival team hidden (${status} season)`);
    const body = await response.json();
    assert.deepEqual(body, { success: false, error: 'Team not found.' }, 'same answer as a missing team');
    assert.deepEqual(calls, [], 'no squad or manager row is read for another manager');
    assert.equal(reads, 0, 'no season lookup for another manager');
  }
  reset();
  const missing = await (await get('33333333-3333-4333-8333-333333333333')).json();
  const rival = await (await get(rivalId)).json();
  assert.deepEqual(rival, missing, 'an existing rival is indistinguishable from an unknown id');

  // Your own team: always the live (newest) squad, with no other manager's data.
  reset();
  const response = await get();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['season', 'success', 'team'], 'no comparison team in the payload');
  assert.deepEqual(body.team.picks.map(p => p.playerId), ['p1', 'p2'], 'your live squad');
  assert.ok(!JSON.stringify(body).includes('p9') && !JSON.stringify(body).includes(rivalId), 'no rival data leaks');
  assert.equal(body.team.teamName, 'Mine XI'); assert.equal(body.team.rank, 2); assert.equal(body.team.totalPoints, 88);
  assert.equal(body.team.squadValueDinoDollars, 3500);
  assert.equal(body.team.picks[0].player.stats.runs, 120);
  assert.ok(!JSON.stringify(body).includes('email'), 'no manager contact details in the payload');
  assert.deepEqual(calls, ['fantasy_squads'], 'only your own squads are read');
  reset(); squads[me.id] = [];
  assert.equal((await get()).status, 404, 'no saved squad');

  // No page links to another manager's team, and the compare view is gone.
  const standings = fs.readFileSync('app/fantasy/manager-leaderboard/page.tsx', 'utf8');
  const leagues = fs.readFileSync('app/fantasy/_components/LeaguesClient.tsx', 'utf8');
  const teamView = fs.readFileSync('app/fantasy/_components/ManagerTeamView.tsx', 'utf8');
  for (const [name, source] of [['standings', standings], ['leagues', leagues]]) assert.doesNotMatch(source, /\/fantasy\/managers\//, `${name} does not link to manager teams`);
  assert.doesNotMatch(teamView, /Compare with my team|sharedPlayerIds|\.mine\b/, 'compare view removed');
  assert.match(fs.readFileSync('app/fantasy/managers/[managerId]/page.tsx', 'utf8'), /robots: \{ index: false, follow: false \}/);
  console.log('PASS: Dino Coach teams are private: rival teams return 404 without reads, own team only, no links or compare view.');
})().catch(error => { console.error(error); process.exit(1); });
