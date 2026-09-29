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

// 1. Reveal rule: hidden only while a squad could still be saved.
const open = { seasonAllowsTeamChanges: true, launchEnabled: true, selectionOpen: true, isCurrentSeason: true, roundLocked: false };
assert.equal(view.teamsRevealed(open), false, 'open selection hides rival teams');
for (const change of [{ seasonAllowsTeamChanges: false }, { launchEnabled: false }, { selectionOpen: false }, { roundLocked: true }]) {
  assert.equal(view.teamsRevealed({ ...open, ...change }), true, JSON.stringify(change));
}
assert.equal(view.teamsRevealed({ ...open, isCurrentSeason: false, roundLocked: true }), false, 'round locks apply to the current season only, as in the save route');

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
let authed = true, settings, lock, season, managerRow, demoRow, squads, calls;
const reset = () => {
  authed = true; calls = [];
  settings = { public_launch_enabled: true, team_selection_open: false, slot_counts: {} };
  lock = { locked: false }; season = { id: 'season-1', name: '2026/27', slug: '2026-27', is_current: true };
  managerRow = { id: rivalId, display_name: 'Rival', team_name: 'Rival XI', is_active: true, deleted_at: null, hidden_at: null };
  demoRow = { is_demo: false };
  squads = { [rivalId]: [row('p1', 'XI_BAT_1', { is_captain: true }), row('p2', 'XI_BOWL_1')], [me.id]: [row('p2', 'XI_BAT_1')] };
};
const db = { from(table) { const filters = {}; const q = {
  select: () => q, order: () => q, limit: () => q, in: () => q,
  eq: (k, v) => { filters[k] = v; return q; },
  maybeSingle: async () => {
    calls.push(table);
    if (table === 'fantasy_managers') return { data: managerRow, error: null };
    if (table === 'fantasy_entries') return { data: demoRow, error: null };
    if (table === 'fantasy_squads') return { data: squads[filters.manager_id] ? { id: 'sq', fantasy_squad_players: squads[filters.manager_id] } : null, error: null };
    throw new Error(`Unexpected table ${table}`);
  },
}; return q; } };
const route = load('app/api/fantasy/managers/[managerId]/team/route.ts', {
  'next/server': { NextResponse },
  '@/lib/fantasy-manager-auth': { resolveFantasyManagerAuth: async () => authed ? { auth: { manager: me } } : { auth: null, errorMessage: 'Please sign in to continue.', errorStatus: 401 } },
  '@/lib/supabase-server': { createServerClient: () => db },
  '@/lib/fantasy-seasons': { resolveRequestSeason: async () => season, seasonAllowsTeamChanges: s => s.is_current },
  '@/lib/fantasy-game': { getActivePlayersWithLatestPrices: async () => [...players.values()], getRoundLockState: async () => lock },
  '@/lib/dino-coach/domain': { buildSquadSlots: () => slots },
  '@/lib/dino-coach/server': { getDinoCoachSettings: async () => settings },
  '@/lib/dino-coach/player-stats-server': { getPlayerStats: async () => new Map([['p1', { runs: 120 }]]) },
  '@/lib/dino-coach/round-scoring': { SCORING_SQUAD_STATUSES: ['draft', 'submitted', 'locked'] },
  '@/lib/server/dino-public-cache': { getCachedManagerStandings: async () => [{ managerId: rivalId, rank: 2, totalPoints: 88, squadValueDinoDollars: 4000 }] },
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

  reset(); settings.team_selection_open = true;
  const hidden = await get();
  assert.equal(hidden.status, 403, 'open selection window hides rivals');
  assert.equal((await hidden.json()).error, view.TEAMS_HIDDEN_MESSAGE);
  assert.ok(!calls.includes('fantasy_squads'), 'no squad is read while hidden');
  assert.equal((await get(me.id)).status, 200, 'your own team is always visible');

  reset(); settings.team_selection_open = true; lock = { locked: true };
  assert.equal((await get()).status, 200, 'locked round reveals teams');

  for (const change of [{ hidden_at: '2026-09-01' }, { deleted_at: '2026-09-01' }, { is_active: false }]) {
    reset(); Object.assign(managerRow, change);
    assert.equal((await get()).status, 404, JSON.stringify(change));
  }
  reset(); demoRow = { is_demo: true };
  assert.equal((await get()).status, 404, 'demo teams stay private');
  reset(); delete squads[rivalId];
  assert.equal((await get()).status, 404);

  reset();
  const response = await get();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  const body = await response.json();
  assert.equal(body.team.teamName, 'Rival XI'); assert.equal(body.team.rank, 2); assert.equal(body.team.totalPoints, 88);
  assert.deepEqual(body.team.picks.map(p => [p.displayName, p.isCaptain, p.purchasePriceDinoDollars]), [['Alex', true, 1000], ['Blake', false, 1000]]);
  assert.equal(body.team.picks[0].player.stats.runs, 120);
  assert.equal(body.mine.teamName, 'Mine XI'); assert.equal(body.mine.rank, null);
  assert.equal(body.mine.squadValueDinoDollars, 2000, 'unranked team falls back to market value');
  assert.ok(!JSON.stringify(body).includes('email'), 'no manager contact details in the payload');

  // Standings and private leagues link team names to the team view.
  assert.match(fs.readFileSync('app/fantasy/manager-leaderboard/page.tsx', 'utf8'), /href=\{`\/fantasy\/managers\/\$\{row\.managerId\}\$\{seasonQuery\}`\}/);
  assert.match(fs.readFileSync('app/fantasy/_components/LeaguesClient.tsx', 'utf8'), /\/fantasy\/managers\/\$\{row\.managerId\}/);
  assert.match(fs.readFileSync('app/fantasy/managers/[managerId]/page.tsx', 'utf8'), /robots: \{ index: false, follow: false \}/);
  console.log('PASS: Dino team view reveal rule, slot order, compare, market value, sign-in, fairness gate, privacy exclusions and payload.');
})().catch(error => { console.error(error); process.exit(1); });
