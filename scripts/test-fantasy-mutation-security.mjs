import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(file, imports, fallback) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', code)(id => {
    if (id in imports) return imports[id];
    if (fallback) return fallback;
    throw new Error(`Unexpected import: ${id}`);
  }, exports);
  return exports;
}
let allowed = true;
let authenticated = true;
const limits = [];
const next = { NextResponse: { json: Response.json } };
const guard = load('lib/server/fantasy-mutation.ts', {
  'server-only': {}, 'next/server': next,
  '@/lib/server/request-guards': { enforceRateLimit: async (...args) => { limits.push(args); return allowed; } },
});
const request = (body, headers = {}) => new Request('https://example.invalid/api/fantasy/squad', {
  method: 'POST', body, headers,
});
const valid = { selection: Array.from({ length: 15 }, (_, i) => ({ playerId: `player-${i}`, slotKey: `slot-${i}` })), mode: 'draft' };
assert.deepEqual((await guard.readFantasyMutation(request(JSON.stringify(valid)), 'verified-owner', 'squad')).body, valid);
assert.deepEqual(limits.pop(), ['fantasy-write-squad:verified-owner', 60, 60000]);
for (const value of ['null', '[]', '42', 'true', '"text"', '{', '']) {
  assert.equal((await guard.readFantasyMutation(request(value), 'owner', 'squad')).response.status, 400);
}
for (const headers of [{}, { 'content-length': '1' }]) {
  assert.equal((await guard.readFantasyMutation(request(JSON.stringify({ text: 'x'.repeat(65536) }), headers), 'owner', 'squad')).response.status, 413);
}
// The limit counts bytes, not UTF-16 characters.
assert.equal((await guard.readFantasyMutation(request(JSON.stringify({ text: '🦖'.repeat(17000) })), 'owner', 'squad')).response.status, 413);
assert.equal((await guard.readFantasyMutation(request('{}', { 'content-length': '65537' }), 'owner', 'squad')).response.status, 413);
assert.deepEqual((await guard.readFantasyMutation(request(JSON.stringify({ text: 'x'.repeat(65525) })), 'owner', 'squad')).body, { text: 'x'.repeat(65525) });
allowed = false;
const denied = await guard.readFantasyMutation({ get headers() { throw new Error('must not read body after rate rejection'); } }, 'owner', 'squad');
assert.equal(denied.response.status, 429);
assert.equal(denied.response.headers.get('retry-after'), '60');
allowed = true;

// Execute every route with the actual guard. Any downstream business/DB call
// during rejection throws: rejection must precede season lookups and writes.
const forbidden = new Proxy({}, { get: () => () => { throw new Error('Unexpected downstream operation'); } });
const imports = {
  'next/server': next,
  '@/lib/server/fantasy-mutation': guard,
  '@/lib/fantasy-manager-auth': {
    resolveFantasyManagerAuth: async () => authenticated ? { auth: { manager: { id: 'verified-owner' } } } : { auth: null, errorStatus: 401 },
    getAuthUserFromRequest: async () => authenticated ? { id: 'verified-owner', email: 'test@example.invalid' } : null,
  },
};
for (const path of ['squad', 'transfers', 'chips', 'rules/accept', 'squad/carryover', 'leagues', 'manager']) {
  const route = load(`app/api/fantasy/${path}/route.ts`, imports, forbidden);
  authenticated = false;
  const before = limits.length;
  assert.equal((await route.POST(request('{}'))).status, 401, path);
  assert.equal(limits.length, before, 'unauthenticated callers do not consume another manager limit');
  authenticated = true;
  allowed = false;
  assert.equal((await route.POST(request('{}'))).status, 429, path);
  assert.match(limits.at(-1)[0], /:verified-owner$/);
  allowed = true;
  for (const body of ['null', '[]', '{']) assert.equal((await route.POST(request(body))).status, 400, path);
  assert.equal((await route.POST(request(JSON.stringify({ text: 'x'.repeat(65536) })))).status, 413, path);
}
const squad = load('app/api/fantasy/squad/route.ts', imports, forbidden);
for (const selection of [null, {}, [null], [42], [[]], Array(101).fill({})]) {
  assert.equal((await squad.POST(request(JSON.stringify({ selection })))).status, 400);
}
const leagues = load('app/api/fantasy/leagues/route.ts', imports, forbidden);
assert.equal((await leagues.POST(request('{"action":"unexpected"}'))).status, 400);
console.log('PASS bounded JSON, multibyte/chunked size checks, per-actor limits, valid squad payload, seven route rejection boundaries and invalid selection/action handling');
