const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Response, URL, console: { error() {} }, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name];
  } });
  return exports;
}
const csv = load('lib/csv.ts', {});
const serializer = load('lib/dino-coach/catalogue-export.ts', { '@/lib/csv': csv });
const season = { id: 'season-1', slug: 'season-one', name: 'Selected season' };
let players = [{ id: 'p1', display_name: '=DANGER,"Name"\nSecond line', role: 'BAT', team_label: 'First XI', price_dino_dollars: 1234000, source_status: 'external_partial', published_at: '2026-09-24T00:00:00Z', email: 'private@example.invalid' },
  { id: 'p2', display_name: 'Unpriced player', role: 'BOWL', price_dino_dollars: 0, source_status: 'unrated', published_at: null }];
const stats = new Map([['p1', { period: 'Earlier season', source: 'Verified history', matches: 2, runs: 0, wickets: 5, catches: null, stumpings: 0, runouts: null, maidens: 0 }]]);
const points = new Map([['p1', { total: 0, matches: 2 }]]);
function parse(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (char === '\r' && text[i + 1] === '\n' && !quoted) { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += char;
  }
  assert.equal(quoted, false); return rows;
}
const output = serializer.catalogueCsv(season, players, stats, points, 'now');
assert.equal(output.charCodeAt(0), 0xfeff);
const parsed = parse(output), headers = parsed[0];
const value = (row, header) => parsed[row][headers.indexOf(header)];
assert.equal(parsed.length, 3);
assert.ok(parsed.every(row => row.length === 23));
assert.equal(value(1, 'Player'), '\'=DANGER,"Name"\nSecond line');
assert.equal(value(1, 'Price (Dino Dollars)'), '1234000');
assert.equal(value(1, 'Runs'), '0'); assert.equal(value(1, 'Catches'), '');
assert.equal(value(1, 'Published season points'), '0');
assert.equal(value(1, 'Stats period'), 'Earlier season');
assert.equal(value(2, 'Price (Dino Dollars)'), '');
assert.equal(value(2, 'Price status'), 'Awaiting verified price');
assert.equal(value(2, 'Stats matches'), ''); assert.equal(value(2, 'Published season points'), '');
assert.ok(!output.includes('private@example.invalid'), 'Only public catalogue fields may be exported');
let resolved = season, failure = false;
const calls = [];
const { GET } = load('app/api/fantasy/players/export/route.ts', {
  'next/server': { NextResponse: { json: (data, options) => Response.json(data, options) } },
  '@/lib/fantasy-seasons': { resolveRequestSeason: async () => resolved },
  '@/lib/fantasy-game': { getActivePlayersWithLatestPrices: async id => { calls.push(id); return players; } },
  '@/lib/dino-coach/player-stats-server': { getPlayerStats: async id => { calls.push(id); if (failure) throw new Error('secret database error'); return stats; } },
  '@/lib/fantasy-leaderboard': { getPublishedFantasyLeaderboard: async (_round, id) => { calls.push(id); return { rows: [{ playerId: 'p1', totalFantasyPoints: 0, matchesCounted: 2 }] }; } },
  '@/lib/dino-coach/catalogue-export': serializer,
});
(async () => {
  let result = await GET(new Request('https://example.invalid/api/fantasy/players/export?season=season-one'));
  assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.match(result.headers.get('content-type'), /text\/csv/);
  assert.match(result.headers.get('content-disposition'), /^attachment; filename="dino-coach-players-season-one-/);
  assert.deepEqual(calls, ['season-1', 'season-1', 'season-1']);
  assert.equal(parse(await result.text()).length, 3);
  players = players.map(p => ({ ...p, price_dino_dollars: 1500000 }));
  result = await GET(new Request('https://example.invalid/api/fantasy/players/export'));
  assert.match(await result.text(), /1500000/, 'A later download must load newly published prices');
  result = await GET(new Request('https://example.invalid/api/fantasy/players/export?season=private-or-stale'));
  assert.equal(result.status, 404);
  failure = true; result = await GET(new Request('https://example.invalid/api/fantasy/players/export'));
  assert.equal(result.status, 503); assert.doesNotMatch(await result.text(), /secret database error/);
  resolved = null; result = await GET(new Request('https://example.invalid/api/fantasy/players/export'));
  assert.equal(result.status, 404);
  // Real shared aggregation must include rows beyond PostgREST's default cap.
  let statRows = [], ranges = [], failSecondPage = false;
  const leaderboardModule = load('lib/fantasy-leaderboard.ts', {
    '@/lib/fantasy-scoring': { calculateFantasyPoints: line => line.runs },
    '@/lib/supabase-server': { isServerSupabaseConfigured: () => true, createServerClient: () => ({
      from(table) {
        const query = {
          select() { return this; }, eq() { return this; }, in() { return this; },
          order() { return this; },
          range(start, end) {
            ranges.push([start, end]);
            return Promise.resolve(failSecondPage && start > 0
              ? { data: null, error: { message: 'Later page unavailable' } }
              : { data: statRows.slice(start, end + 1), error: null });
          },
          then(resolve) { return Promise.resolve({ data: table === 'fantasy_import_batches' ? [{ id: 'batch' }] : [], error: null }).then(resolve); },
        };
        return query;
      },
    }) },
  });
  for (const count of [0, 1001, 2000]) {
    ranges = [];
    statRows = Array.from({ length: count }, (_, i) => ({ id: String(i), player_id: 'p1', runs: 1, fantasy_players: { display_name: 'Test player', role: 'BAT' } }));
    const board = await leaderboardModule.getPublishedFantasyLeaderboard(null, 'season-1');
    if (count) {
      assert.equal(board.rows[0].matchesCounted, count);
      assert.equal(board.rows[0].totalFantasyPoints, count);
      const complete = parse(serializer.catalogueCsv(season, players, stats, new Map(board.rows.map(row => [row.playerId, { total: row.totalFantasyPoints, matches: row.matchesCounted }])), 'now'));
      assert.equal(complete[1][headers.indexOf('Published season points')], String(count));
    } else assert.equal(board.rows.length, 0);
    assert.equal(ranges.length, Math.floor(count / 1000) + 1);
  }
  failSecondPage = true;
  await assert.rejects(leaderboardModule.getPublishedFantasyLeaderboard(null, 'season-1'), /Later page unavailable/);
  console.log('PASS catalogue CSV escaping, blanks versus zero, public fields, season scoping, fresh prices, download headers and failure responses');
})().catch(error => { console.error(error); process.exitCode = 1; });
