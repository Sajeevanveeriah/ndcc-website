import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const members = ['a', 'b', 'c', 'demo', 'empty'].map(managerId => ({ managerId, displayName: managerId, teamName: `${managerId} XI` }));
const scores = (manager, points, season = 'current') => ({ manager_id: manager, total_points: points, net_points: points, transfer_penalty: 0, season_id: season, fantasy_managers: { display_name: manager, team_name: `${manager} XI` } });
const tables = {
  fantasy_managers: [],
  fantasy_manager_round_scores: [scores('a', 40), scores('a', 60), scores('b', 100), scores('c', 100), scores('demo', 999), scores('a', 999, 'old')],
  fantasy_entries: [{ manager_id: 'demo', season_id: 'current', is_demo: true }, { manager_id: 'a', season_id: 'old', is_demo: true }],
  fantasy_squads: ['a', 'b', 'c', 'demo'].map(id => ({ id, manager_id: id, season_id: 'current', status: 'submitted', created_at: '2026-09-16' })).concat([
    { id: 'a-old', manager_id: 'a', season_id: 'current', status: 'submitted', created_at: '2026-09-01' },
    { id: 'a-draft', manager_id: 'a', season_id: 'current', status: 'draft', created_at: '2026-09-17' },
  ]),
  fantasy_squad_players: ['a', 'b', 'c', 'demo', 'a-old', 'a-draft'].map(id => ({ squad_id: id, player_id: id })),
  fantasy_player_prices: [
    ...['a', 'b', 'c'].map(id => ({ player_id: id, season_id: 'current', price_dino_dollars: id === 'a' ? 100000 : 200000, published_at: '2026-09-16', created_at: '2026-09-16' })),
    { player_id: 'a', season_id: 'current', price_dino_dollars: 900000, published_at: null, created_at: '2026-09-17' },
    { player_id: 'a', season_id: 'current', price_dino_dollars: 800000, published_at: '2026-09-01', created_at: '2026-09-01' },
    ...['a-old', 'a-draft'].map(id => ({ player_id: id, season_id: 'current', price_dino_dollars: 1000000, published_at: '2026-09-16', created_at: '2026-09-16' })),
  ],
};
let failTable;
const db = { from(table) {
  let data = [...tables[table]];
  const query = {
    select() { return query; },
    or() { data = data.filter(row => row.hidden_at || row.deleted_at || row.is_active === false); return query; },
    eq(key, value) { data = data.filter(row => row[key] === value); return query; },
    in(key, values) { data = data.filter(row => values.includes(row[key])); return query; },
    not(key, _operator, value) { data = data.filter(row => row[key] !== value); return query; },
    order(key, { ascending }) { data.sort((a, b) => (ascending ? 1 : -1) * a[key].localeCompare(b[key])); return query; },
    then(resolve, reject) { return Promise.resolve({ data, error: table === failTable ? { message: 'Read failed' } : null }).then(resolve, reject); },
  };
  return query;
} };
const source = ts.transpileModule(readFileSync('lib/dino-coach/standings.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', source)(id => {
  assert.equal(id, '@/lib/supabase-server');
  return { createServerClient: () => db, isServerSupabaseConfigured: () => true };
}, module, module.exports);
const load = module.exports.getDinoManagerStandings;
const rows = await load('current');
assert.deepEqual(rows.map(row => row.managerId), ['b', 'c', 'a']);
assert.deepEqual(rows.map(row => row.rank), [1, 2, 3]);
assert.equal(rows[2].totalPoints, 100);
assert.equal(rows[2].squadValueDinoDollars, 100000);
assert.equal(rows[2].totalNetPoints, 100);
console.log('PASS public demo exclusion, season isolation, score aggregation, value then team-name ties, latest submitted squad and published prices');
const league = await load('current', { members: members.filter(row => ['a', 'c', 'demo', 'empty'].includes(row.managerId)), includeDemo: true });
assert.deepEqual(league.map(row => row.managerId), ['demo', 'c', 'a', 'empty']);
assert.equal(league.at(-1).totalPoints, 0);
assert.deepEqual(await load('current', { members: [] }), []);
console.log('PASS private membership scope, zero-score members and private demo practice');
tables.fantasy_managers = [{id:'a',hidden_at:'2026-09-18',is_active:true},{id:'b',deleted_at:'2026-09-18',is_active:false}];
assert.deepEqual((await load('current')).map(r=>r.managerId),['c']);
assert.deepEqual((await load('current',{members,includeDemo:true})).map(r=>r.managerId),['demo','c','empty']);
tables.fantasy_managers=[];
console.log('PASS hidden and deleted managers excluded from public and private rankings');
for (failTable of Object.keys(tables)) await assert.rejects(load('current'), /Read failed/);
console.log('PASS every database read fails visibly instead of returning a misleading ranking');
for (const path of ['app/fantasy/manager-leaderboard/page.tsx', 'app/api/fantasy/manager-leaderboard/route.ts', 'app/api/fantasy/leagues/route.ts']) {
  const route = readFileSync(path, 'utf8');
  assert.match(route, /getDinoManagerStandings/);
  assert.doesNotMatch(route, /from\('fantasy_manager_round_scores'\)/);
}
console.log('PASS page, public API and private leagues use the same standings loader');
