import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(path, imports = {}) {
  const mod = { exports: {} };
  const js = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', js)(id => {
    if (id in imports) return imports[id];
    throw new Error(`Unmocked import ${id}`);
  }, mod, mod.exports);
  return mod.exports;
}
const privacy = load('lib/analytics-privacy.ts');
assert.deepEqual(privacy.sanitiseAnalyticsEvent({ type: 'pageview', url: 'https://example.invalid/fantasy/account?code=private#access_token=secret' }), { type: 'pageview', url: 'https://example.invalid/fantasy/account' });
for (const path of ['/admin', '/admin/users', '/api/contacts', '/auth/callback']) assert.equal(privacy.sanitiseAnalyticsEvent({ url: 'https://example.invalid' + path }), null);
assert.equal(privacy.sanitiseAnalyticsEvent({ url: 'invalid' }), null);

const validation = load('lib/dino-coach/feedback-input.ts');
const payload = { id: '3e7e92b0-9ce1-4f02-ae0e-bcfd1d984242', name: 'Visitor', email: 'visitor@example.invalid', kind: 'issue', message: 'The team selection page needs a clearer heading.', hpField: '', submittedAt: Date.now() - 5000 };
assert.equal(validation.validateDinoFeedback(payload).ok, true);
for (const patch of [{ id: 'bad' }, { email: 'invalid' }, { name: '<bad>' }, { kind: 'unsupported' }, { message: 'short' }, { message: 'x'.repeat(5001) }, { submittedAt: '123' }, { hpField: [] }]) assert.equal(validation.validateDinoFeedback({ ...payload, ...patch }).ok, false);

let calls = [], afters = [], allowed = true, honeypot = true, rpcError = null;
const route = load('app/api/fantasy/feedback/route.ts', {
  'next/server': { NextResponse: { json: (body, init) => ({ body, status: init.status }) }, after: fn => afters.push(fn) },
  '@/lib/supabase-server': { createServerClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data: payload.id, error: rpcError }; } }) },
  '@/lib/order-input-validation': { readLimitedJsonObject: async req => req.parsed || { ok: true, value: req.data } },
  '@/lib/server/request-guards': { enforceRateLimit: async () => allowed, enforceHoneypotAndTiming: (hp, started) => honeypot && hp === '' && Date.now() - started >= 1200, getClientIp: () => 'fixture' },
  '@/lib/dino-coach/feedback-input': validation,
  '@/lib/dino-coach/feedback-delivery': { processDinoFeedback: async () => {} },
});
const req = (data = payload, origin = 'https://example.invalid') => ({ data, url: 'https://example.invalid/api/fantasy/feedback', headers: new Headers({ origin }) });
assert.equal((await route.POST(req(payload, 'https://other.invalid'))).status, 403);
allowed = false; assert.equal((await route.POST(req())).status, 429); allowed = true;
assert.equal((await route.POST(req({ ...payload, hpField: 'bot' }))).status, 400);
assert.equal((await route.POST(req({ ...payload, submittedAt: Date.now() }))).status, 400);
assert.equal((await route.POST({ ...req(), parsed: { ok: false, error: 'Request body is too large.' } })).status, 413);
assert.equal(calls.length, 0);
const success = await route.POST(req({ ...payload, to: ['attacker@example.invalid'], recipients: ['attacker@example.invalid'] }));
assert.equal(success.status, 202); assert.equal(success.body.reference, payload.id);
assert.deepEqual(Object.keys(calls[0].args.p_request).sort(), ['email', 'kind', 'message', 'name']);
assert.equal(afters.length, 1);
rpcError = { code: '23505' }; assert.equal((await route.POST(req())).status, 409);
rpcError = { code: 'XX000', message: 'private-recipient@example.invalid' };
const failure = await route.POST(req()); assert.equal(failure.status, 503); assert.ok(!JSON.stringify(failure).includes('private-recipient'));

// Deliver the real worker with a simulated provider timeout and recovery.
const job = { id: payload.id, attempts: 0, request: { ...payload, message: '<script>alert(1)</script> & feedback' }, recipients: ['one@example.invalid', 'two@example.invalid'], delivery: null, sent_at: null };
let available = true, providerFails = true;
const deliveries = [];
const workerDb = {
  rpc: async () => {
    if (!available || job.sent_at) return { data: [], error: null };
    available = false; job.attempts++; return { data: [structuredClone(job)], error: null };
  },
  from: () => ({ update: values => {
    const q = { eq: () => q, is: () => q, then: resolve => { Object.assign(job, structuredClone(values)); return Promise.resolve(resolve({ error: null })); } };
    return q;
  } }),
};
const emailHtml = (title, body) => `<html><h1>${title}</h1>${body}</html>`;
const escapeEmailHtml = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const worker = load('lib/dino-coach/feedback-delivery.ts', {
  'server-only': {}, '@/lib/supabase-server': {},
  '@/lib/email': { emailHtml, escapeEmailHtml, sendEmail: async delivery => {
    assert.ok(job.delivery, 'Immutable payload saved before provider send');
    deliveries.push(structuredClone(delivery));
    return providerFails ? { status: 'failed', reason: 'timeout' } : { status: 'sent', id: 'provider-id' };
  } },
});
assert.equal((await worker.processDinoFeedback(workerDb, Date.now() + 1000, job.id)).retrying, 1);
assert.equal(job.sent_at, null);
available = true; providerFails = false; job.request.message = 'Changed afterwards';
assert.equal((await worker.processDinoFeedback(workerDb, Date.now() + 1000, job.id)).sent, 1);
assert.deepEqual(deliveries[0], deliveries[1]);
assert.deepEqual(deliveries[1].to, ['one@example.invalid', 'two@example.invalid']);
assert.equal(deliveries[1].replyTo, payload.email);
assert.ok(deliveries[1].html.includes('&lt;script&gt;'));
assert.ok(!deliveries[1].html.includes('<script>'));
available = true; await worker.processDinoFeedback(workerDb, Date.now() + 1000, job.id); assert.equal(deliveries.length, 2);
console.log('PASS analytics privacy; feedback validation, origin/rate/spam guards, saved-only success, private responses, recipient injection protection, escaped two-recipient email, durable retry and immutable idempotent delivery');
