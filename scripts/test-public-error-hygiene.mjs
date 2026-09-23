#!/usr/bin/env node
// Regression tests: public/player API routes never echo raw database error
// text, the apparel windows API returns only public columns, and Dino Coach
// league codes/joins are hardened. Offline; no database or network access.
import assert from 'node:assert/strict';
import * as nodeCrypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(filename, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'process', code)((name) => {
    if (name === 'server-only') return {};
    assert.ok(name in dependencies, `Unexpected dependency ${name} from ${filename}`);
    return dependencies[name];
  }, module, module.exports, process);
  return module.exports;
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

const quietly = async (fn) => {
  const original = console.error;
  console.error = () => {};
  try { return await fn(); } finally { console.error = original; }
};

const publicErrors = load('lib/server/public-errors.ts');
const nextServer = { NextResponse: { json: (body, init = {}) => Response.json(body, init) } };

await test('only RPC-raised player messages pass through', () => {
  const fallback = 'Generic.';
  assert.equal(publicErrors.publicRpcErrorMessage({ code: 'P0001', message: 'Player price changed. Reload before buying.' }, fallback), 'Player price changed. Reload before buying.');
  assert.equal(publicErrors.publicRpcErrorMessage({ code: '23514', message: 'Exactly one captain is required.' }, fallback), 'Exactly one captain is required.');
  assert.equal(publicErrors.publicRpcErrorMessage({ code: '23514', message: 'new row for relation "fantasy_squads" violates check constraint "x"' }, fallback), fallback);
  assert.equal(publicErrors.publicRpcErrorMessage({ code: '22P02', message: 'invalid input syntax for type uuid: "abc"' }, fallback), fallback);
  assert.equal(publicErrors.publicRpcErrorMessage({ code: '42501', message: 'permission denied for table fantasy_squads' }, fallback), fallback);
  assert.equal(publicErrors.publicRpcErrorMessage(null, fallback), fallback);
});

await test('listed public/player routes never return raw error.message', () => {
  const routes = [
    'app/api/volunteer-positions/route.ts',
    'app/api/apparel/windows/route.ts',
    'app/api/fantasy/leagues/route.ts',
    'app/api/fantasy/transfers/route.ts',
    'app/api/fantasy/squad/route.ts',
    'app/api/fantasy/squad/carryover/route.ts',
    'app/api/fantasy/chips/route.ts',
    'app/api/meeting-minutes/[id]/actions/route.ts',
  ];
  for (const file of routes) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /error:\s*[A-Za-z_.?]*(?:error|Error|err|e)(?:\?)?\.message\b/, `${file} returns error.message`);
    assert.doesNotMatch(source, /e(?:rr|rror)? instanceof Error \? e(?:rr|rror)?\.message/, `${file} echoes thrown messages`);
  }
});

await test('volunteer positions and apparel windows log details and return generic errors', async () => {
  const failing = { from() { const q = { select(columns) { q.columns = columns; return q; }, eq() { return q; }, order() { return Promise.resolve({ data: null, error: { code: '42P01', message: 'relation "secret_table" does not exist' } }); } }; return q; } };
  for (const file of ['app/api/volunteer-positions/route.ts', 'app/api/apparel/windows/route.ts']) {
    const route = load(file, { 'next/server': nextServer, '@/lib/supabase-server': { createServerClient: () => failing, isServerSupabaseConfigured: () => true } });
    const response = await quietly(() => route.GET());
    assert.equal(response.status, 500);
    assert.doesNotMatch(JSON.stringify(await response.json()), /secret_table/);
  }
});

await test('apparel windows select explicit public columns only', async () => {
  let selected = null;
  const rows = [{ id: 'w1', label: 'Window', open_date: '2000-01-01T00:00:00Z', close_date: '2999-01-01T00:00:00Z', allow_queue_after_close: true }];
  const db = { from() { const q = { select(columns) { selected = columns; return q; }, eq() { return q; }, order() { return Promise.resolve({ data: rows, error: null }); } }; return q; } };
  const route = load('app/api/apparel/windows/route.ts', { 'next/server': nextServer, '@/lib/supabase-server': { createServerClient: () => db, isServerSupabaseConfigured: () => true } });
  const body = await (await route.GET()).json();
  assert.equal(selected, 'id,label,open_date,close_date,allow_queue_after_close');
  assert.equal(body.data.current_window.id, 'w1');
  assert.equal(body.data.processing_open, true);
});

await test('league codes are 12 unambiguous characters and joins are throttled', async () => {
  const inserted = [];
  const limits = [];
  let allowJoin = true;
  const db = { from(table) {
    const q = {
      insert(value) { if (table === 'fantasy_leagues') inserted.push(value.code); q.value = value; return q; },
      select() { return q; }, eq() { return q; }, upsert() { return Promise.resolve({ error: null }); },
      async single() { return { data: { id: '11111111-1111-4111-8111-111111111111', name: 'L', code: q.value?.code }, error: null }; },
      async maybeSingle() { return { data: { id: 'league' }, error: null }; },
      then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); },
    };
    return q;
  } };
  const route = load('app/api/fantasy/leagues/route.ts', {
    'node:crypto': nodeCrypto,
    'next/server': nextServer,
    '@/lib/fantasy-manager-auth': { resolveFantasyManagerAuth: async () => ({ auth: { manager: { id: 'manager-1' } } }) },
    '@/lib/supabase-server': { createServerClient: () => db },
    '@/lib/fantasy-seasons': { resolveRequestSeason: async () => ({ id: 'season' }) },
    '@/lib/validation/uuid': load('lib/validation/uuid.ts'),
    '@/lib/dino-coach/standings': { getDinoManagerStandings: async () => [] },
    '@/lib/server/request-guards': { enforceRateLimit: async (key, limit, windowMs) => { limits.push([key, limit, windowMs]); return allowJoin; }, getClientIp: () => '198.51.100.7' },
    '@/lib/server/public-errors': publicErrors,
  });
  const post = (body) => route.POST(new Request('https://example.invalid/api/fantasy/leagues', { method: 'POST', body: JSON.stringify(body) }));
  for (let i = 0; i < 40; i += 1) assert.equal((await post({ action: 'create', name: `League ${i}` })).status, 200);
  assert.equal(inserted.length, 40);
  for (const code of inserted) assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/);
  assert.equal(new Set(inserted).size, inserted.length);
  assert.equal(limits.length, 0, 'creating a league is not throttled by the join limiter');

  assert.equal((await post({ action: 'join', code: 'a1b2c3d4' })).status, 200, 'legacy 8-character hex codes still join');
  assert.deepEqual(limits.map(([key]) => key), ['fantasy-league-join-manager:manager-1', 'fantasy-league-join-ip:198.51.100.7']);
  allowJoin = false;
  assert.equal((await post({ action: 'join', code: 'ABCDEFGHJKMN' })).status, 429);
  allowJoin = true;
  assert.equal((await post({ action: 'leave', leagueId: 'not-a-uuid' })).status, 400);
});

console.log(`\ntest-public-error-hygiene: ${passed} tests passed`);
