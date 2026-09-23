#!/usr/bin/env node
// Offline regression tests for the optional Turnstile verifier, the fail-closed
// rate limiter's structured alert log, and the reverse raffle hold helpers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(filename, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'process', code)((name) => {
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

const turnstile = load('lib/server/turnstile.ts');
const request = (headers = {}) => new Request('https://example.invalid/api/contacts', { method: 'POST', headers });

await test('Turnstile is a no-op while TURNSTILE_SECRET_KEY is unset', async () => {
  let called = false;
  const result = await turnstile.verifyTurnstileToken(null, '1.2.3.4', { env: {}, fetchImpl: async () => { called = true; } });
  assert.deepEqual(result, { ok: true, skipped: true });
  assert.equal(called, false, 'no network call without a secret');
  assert.equal(turnstile.isTurnstileEnabled({ TURNSTILE_SECRET_KEY: '   ' }), false);
});

await test('Turnstile requires and verifies a token once enabled', async () => {
  const env = { TURNSTILE_SECRET_KEY: 'test-secret' };
  assert.deepEqual(await turnstile.verifyTurnstileToken(null, null, { env }), { ok: false, reason: 'missing_token' });
  let sent;
  const accept = async (url, init) => { sent = { url, body: String(init.body) }; return Response.json({ success: true }); };
  assert.deepEqual(await turnstile.verifyTurnstileToken('tok', '1.2.3.4', { env, fetchImpl: accept }), { ok: true, skipped: false });
  assert.equal(sent.url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.match(sent.body, /secret=test-secret/);
  assert.match(sent.body, /response=tok/);
  assert.match(sent.body, /remoteip=1\.2\.3\.4/);
  const reject = async () => Response.json({ success: false, 'error-codes': ['invalid-input-response'] });
  assert.deepEqual(await turnstile.verifyTurnstileToken('bad', null, { env, fetchImpl: reject }), { ok: false, reason: 'invalid_token' });
  const originalError = console.error;
  console.error = () => {};
  try {
    const down = async () => { throw new Error('network down'); };
    assert.deepEqual(await turnstile.verifyTurnstileToken('tok', null, { env, fetchImpl: down }), { ok: false, reason: 'unavailable' }, 'fails closed while enabled');
  } finally {
    console.error = originalError;
  }
});

await test('Turnstile tokens are read from the JSON body or header', () => {
  assert.equal(turnstile.readTurnstileToken(request(), { turnstileToken: ' a ' }), 'a');
  assert.equal(turnstile.readTurnstileToken(request(), { 'cf-turnstile-response': 'b' }), 'b');
  assert.equal(turnstile.readTurnstileToken(request({ 'x-turnstile-token': 'c' }), {}), 'c');
  assert.equal(turnstile.readTurnstileToken(request(), { turnstileToken: 'x'.repeat(5000) }), null);
});

await test('rate limiter fails closed and logs one structured [rate_limit_unavailable] line', async () => {
  const guards = load('lib/server/request-guards.ts', {
    'node:crypto': await import('node:crypto'),
    '@/lib/supabase-server': { createServerClient: () => ({ rpc: async () => ({ data: null, error: { code: 'PGRST301', message: 'upstream unavailable' } }) }) },
    '@/lib/server/turnstile': turnstile,
  });
  const lines = [];
  const originalError = console.error;
  console.error = (...args) => lines.push(args);
  try {
    assert.equal(await guards.enforceRateLimit('admin-login-ip:203.0.113.9', 8, 60_000), false);
  } finally {
    console.error = originalError;
  }
  assert.equal(lines.length, 1);
  assert.equal(lines[0][0], '[rate_limit_unavailable]');
  assert.equal(lines[0][1].scope, 'admin-login-ip');
  assert.equal(lines[0][1].code, 'PGRST301');
  assert.doesNotMatch(JSON.stringify(lines), /203\.0\.113\.9/, 'raw IPs are never logged');
  assert.equal(guards.enforceHoneypotAndTiming('', Date.now() - 5_000), true, 'honeypot/timing behaviour is unchanged');
  assert.equal(guards.enforceHoneypotAndTiming('bot', Date.now() - 5_000), false);
  delete process.env.TURNSTILE_SECRET_KEY;
  assert.equal(await guards.enforceTurnstile(request(), {}), true, 'enforceTurnstile is a no-op when unset');
});

await test('public contact, order, volunteer and raffle routes call the optional Turnstile hook', () => {
  for (const file of ['app/api/contacts/route.ts', 'app/api/orders/route.ts', 'app/api/volunteers/route.ts', 'app/api/raffle/checkout/route.ts']) {
    assert.match(readFileSync(file, 'utf8'), /await enforceTurnstile\(request, /, file);
  }
});

await test('reverse raffle hold helpers bound pending numbers', () => {
  const validation = load('lib/order-input-validation.ts');
  const limits = validation.REVERSE_RAFFLE_HOLD_LIMITS;
  assert.ok(limits.checkoutExpiryMinutes >= 30, 'Stripe rejects expires_at below 30 minutes');
  assert.ok(limits.holdWindowMs >= limits.checkoutExpiryMinutes * 60_000);
  assert.equal(validation.reverseRaffleHoldAllowed(0, 20, limits.maxPendingNumbersPerEmail), true, 'one maximum checkout remains possible');
  assert.equal(validation.reverseRaffleHoldAllowed(1, 20, limits.maxPendingNumbersPerEmail), false);
  assert.equal(validation.reverseRaffleHoldAllowed(null, 1, 20), false);
  assert.equal(validation.sumPendingRaffleQuantities([{ quantity: 2 }, { quantity: 3 }]), 5);
  assert.equal(validation.sumPendingRaffleQuantities([{ quantity: '2' }]), null);
  assert.equal(validation.sumPendingRaffleQuantities(null), null);
  assert.match(readFileSync('app/api/raffle/checkout/route.ts', 'utf8'), /expires_at: Math\.floor\(Date\.now\(\) \/ 1000\) \+ 35 \* 60/);
});

await test('public form input is stored as typed (no HTML encoding or tag stripping)', () => {
  const utils = load('lib/utils.ts');
  assert.equal(utils.sanitiseInput('  O\'Brien & Sons <Pty> "Ltd"  '), 'O\'Brien & Sons <Pty> "Ltd"');
  assert.equal(utils.sanitiseInput('line one\nline two\tend'), 'line one\nline two\tend', 'newlines and tabs survive');
  assert.equal(utils.sanitiseInput('a\u0000b\u0007c​d﻿'), 'abcd', 'control and zero-width characters are removed');
  assert.equal(utils.sanitiseInput('I <3 cricket > football'), 'I <3 cricket > football', 'angle brackets are not treated as tags');
  for (const file of ['app/api/contacts/route.ts', 'app/api/events/route.ts', 'app/api/kitchen/orders/route.ts', 'app/api/memberships/route.ts', 'app/api/orders/route.ts', 'app/api/volunteers/route.ts']) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /import \{[^}]*\bsanitiseInput\b[^}]*\} from '@\/lib\/utils'/, `${file} uses the shared sanitiser`);
    assert.doesNotMatch(source, /function sanitiseInput/, `${file} has no local HTML-altering sanitiser`);
  }
});

console.log(`\ntest-request-guard-hardening: ${passed} tests passed`);
