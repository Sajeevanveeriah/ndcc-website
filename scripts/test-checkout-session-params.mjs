#!/usr/bin/env node
// F59 regression: the shared Checkout Session helper must not change what any
// route sends to Stripe. Covers the helper itself and the Dino Coach route
// (whose idempotency key hashes the params, so key order matters). The
// generic order route and raffle route are covered by exact create()
// assertions in test-consolidated-receipts.mjs and test-reverse-raffle.mjs.
// Stripe, Supabase and auth are mocks; nothing leaves the process.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, dependencies) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, URL, Buffer, process, console,
    require(name) {
      if (name === 'server-only') return {};
      if (name === 'node:crypto') return { createHash };
      assert.ok(name in dependencies, `unexpected import ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}
// Compare across the vm realm boundary by serialisation (also checks key order).
const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

const checkout = load('lib/payments/stripe-checkout.ts', {});

await test('builder puts mode first, keeps caller key order and omits undefined fields', () => {
  const lineItems = [{ price_data: { currency: 'aud', unit_amount: 100, product_data: { name: 'x' } }, quantity: 1 }];
  const params = checkout.buildPaymentCheckoutSessionParams({
    customer_email: 'a@example.com', expires_at: undefined, line_items: lineItems,
    success_url: 's', cancel_url: 'c', client_reference_id: 'r', metadata: { a: '1' },
    payment_intent_data: { description: 'd', metadata: { a: '1' } },
  });
  same(Object.keys(params), ['mode', 'customer_email', 'line_items', 'success_url', 'cancel_url',
    'client_reference_id', 'metadata', 'payment_intent_data']);
  assert.equal(params.mode, 'payment');
  assert.equal(Object.hasOwn(params, 'expires_at'), false);
  assert.equal(params.line_items, lineItems, 'values are passed through, not copied');
  const withEmptyValues = checkout.buildPaymentCheckoutSessionParams({
    client_reference_id: '', customer_email: null, expires_at: 0, line_items: [], success_url: '', cancel_url: '',
    metadata: {}, payment_intent_data: {},
  });
  same(Object.keys(withEmptyValues), ['mode', 'client_reference_id', 'customer_email', 'expires_at', 'line_items',
    'success_url', 'cancel_url', 'metadata', 'payment_intent_data'], 'only undefined is omitted');
});

await test('create wrapper forwards params and the caller idempotency key unchanged', async () => {
  const calls = [];
  const client = { checkout: { sessions: { create: async (...args) => { calls.push(args); return { id: 'cs_1' }; } } } };
  const params = { mode: 'payment' };
  const result = await checkout.createPaymentCheckoutSession(client, params, 'key-1');
  assert.equal(result.id, 'cs_1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], params);
  same(calls[0][1], { idempotencyKey: 'key-1' });
});

// Dino Coach Checkout route.
const reference = 'NDCCDIN-2026-000007';
const manager = { id: 'mgr-1', email: 'coach@example.com', age_verified_at: '2026-01-01', team_name_status: 'approved',
  rules_version_accepted: 'r1', is_active: true };
const season = { id: 'season-1', name: 'Dino Coach 2026' };
const settings = { public_launch_enabled: true, registration_open: true, entry_fee_cents: 2500, entry_fee_currency: 'AUD',
  rules_version: 'r1' };
let entry;
let creates;
let createStatuses;
const db = {
  from(table) {
    const query = {
      select() { return query; }, is() { return query; }, eq() { return query; }, in() { return query; }, upsert() { return query; }, update() { return query; },
      async single() { return table === 'fantasy_managers' ? { data: manager } : { data: entry }; },
      async maybeSingle() { return { data: table === 'fantasy_entries' ? entry : null, error: null }; },
    };
    return query;
  },
  async rpc(name) {
    assert.equal(name, 'ensure_fantasy_entry_payment_reference');
    return { data: reference, error: null };
  },
};
let settingsFailure = null;
let createFailure = null;
const stripe = { checkout: { sessions: {
  async create(params, options) {
    if (createFailure) throw createFailure;
    creates.push({ params, options });
    const status = createStatuses.shift() || 'open';
    return { ...params, id: `cs_dino_${creates.length}`, status, url: 'https://checkout.stripe.com/dino',
      amount_total: params.line_items[0].price_data.unit_amount, currency: 'aud' };
  },
  async retrieve() { throw new Error('not expected'); },
  async expire() { throw new Error('not expected'); },
} } };
const dinoRoute = load('app/api/fantasy/checkout/route.ts', {
  'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
  '@/lib/fantasy-manager-auth': { resolveFantasyManagerAuth: async () => ({ auth: { manager: { id: manager.id } } }) },
  '@/lib/fantasy-seasons': { resolveRequestSeason: async () => season },
  '@/lib/dino-coach/server': { getDinoCoachSettings: async () => { if (settingsFailure) throw settingsFailure; return settings; } },
  '@/lib/supabase-server': { createServerClient: () => db },
  '@/lib/payments/bank-transfer': { configuredBankDetails: () => null },
  '@/lib/payments/capabilities': { loadMerchPaymentSettings: async () => ({}), deriveCapabilities: () => ({card:true,bank_transfer:false}) },
  '@/lib/stripe': { getStripe: () => stripe },
  '@/lib/payments/payment-config': { isCheckoutEnabled: () => true },
  '@/lib/payments/reference': { isCanonicalPaymentReference: (value) => value === reference },
  '@/lib/payments/site-url': { getCheckoutSiteUrl: () => 'https://www.ndcc.com.au' },
  '@/lib/payments/stripe-checkout': checkout,
  '@/lib/server/request-guards': { enforceRateLimit: async () => true },
  '@/lib/order-input-validation': { PUBLIC_ORDER_LIMITS: { maximumOrderCents: 10000000 },
    readLimitedJsonObject: async () => ({ ok: true, value: {} }) },
});

// The exact params object the route built before the helper existed.
function expectedDinoParams() {
  const metadata = {
    ndcc_payment_reference: reference, ndcc_payment_type: 'dino_coach', ndcc_order_id: 'entry-1',
    ndcc_reference_version: '1', receipt_email_version: '1', item_number: reference, product: 'Dino Coach',
    manager_id: manager.id, season_id: season.id, entry_id: 'entry-1', rules_version: 'r1',
    expected_amount_cents: '2500', payment_reference: reference,
  };
  return {
    mode: 'payment', client_reference_id: reference, customer_email: manager.email,
    line_items: [{ price_data: { currency: 'aud', unit_amount: 2500,
      product_data: { name: `Dino Coach 2026 entry - ${reference}`, description: 'Newcomb & District Cricket Club participation fee' } }, quantity: 1 }],
    success_url: 'https://www.ndcc.com.au/fantasy/account?payment=submitted&session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://www.ndcc.com.au/fantasy/account?payment=cancelled',
    metadata,
    payment_intent_data: { receipt_email: manager.email, description: `${reference} - NDCC Dino Coach`, metadata },
  };
}
const digest = createHash('sha256').update(JSON.stringify(expectedDinoParams())).digest('hex').slice(0, 32);

await test('Dino Coach route sends identical params and payload-digest idempotency key', async () => {
  entry = { id: 'entry-1', entry_fee_cents: 2500, currency: 'AUD', status: 'payment_required', stripe_checkout_session_id: null };
  creates = []; createStatuses = [];
  const response = await dinoRoute.POST({ url: 'https://www.ndcc.com.au/api/fantasy/checkout' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(creates.length, 1);
  same(creates[0].params, expectedDinoParams());
  same(creates[0].options, { idempotencyKey: `ndcc:dino:v2:entry-1:first:${digest}` });
});

await test('Dino Coach expired-session recovery reuses the params with a session-scoped key', async () => {
  entry = { id: 'entry-1', entry_fee_cents: 2500, currency: 'AUD', status: 'payment_required', stripe_checkout_session_id: null };
  creates = []; createStatuses = ['expired', 'open'];
  const response = await dinoRoute.POST({ url: 'https://www.ndcc.com.au/api/fantasy/checkout' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(creates.length, 2);
  same(creates[1].params, expectedDinoParams());
  same(creates[1].options, { idempotencyKey: `ndcc:dino:v2:entry-1:cs_dino_1:${digest}` });
});

await test('Dino Coach settings failure returns friendly JSON', async () => {
  entry = { id: 'entry-1', entry_fee_cents: 2500, currency: 'AUD', status: 'payment_required', stripe_checkout_session_id: null };
  creates = []; createStatuses = [];
  settingsFailure = new Error('private settings failure');
  const response = await dinoRoute.POST({ url: 'https://www.ndcc.com.au/api/fantasy/checkout' });
  settingsFailure = null;
  assert.equal(response.status, 500);
  assert.equal(response.body.success, false);
  assert.ok(!JSON.stringify(response.body).includes('private settings failure'));
  assert.equal(creates.length, 0);
});

await test('Dino Coach Stripe failure returns a friendly gateway error', async () => {
  entry = { id: 'entry-1', entry_fee_cents: 2500, currency: 'AUD', status: 'payment_required', stripe_checkout_session_id: null };
  creates = []; createStatuses = [];
  createFailure = Object.assign(new Error('private Stripe failure'), { type: 'StripeAPIError' });
  const response = await dinoRoute.POST({ url: 'https://www.ndcc.com.au/api/fantasy/checkout' });
  createFailure = null;
  assert.equal(response.status, 502);
  assert.equal(response.body.success, false);
  assert.ok(!JSON.stringify(response.body).includes('private Stripe failure'));
});

console.log(`Checkout Session params: ${passed} checks passed.`);
