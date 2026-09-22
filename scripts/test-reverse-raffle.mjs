import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Isolated execution of production handlers. No real checkout, mail or DB writes.
function load(file, dependencies) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, URL, Buffer, process, console,
    require(name) { if (name === 'server-only') return {}; assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  return exports;
}
const input = { name: 'Test purchaser', email: 'buyer@example.com', phone: '', quantity: 2 };
let selected, inserted, payload, hidden = false;
const db = { from() { return {
  insert(value) { inserted = value; return this; }, select() { return this; },
  async single() { return { data: { id: 'test-order' } }; },
  update() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { id: 'test-order' } }; },
}; } };
const route = load('app/api/raffle/checkout/route.ts', {
  'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
  '@/lib/supabase-server': { createServerClient: () => db },
  '@/lib/stripe': { getStripe: () => ({ checkout: { sessions: { create: async value => {
    payload = value; return { ...value, id: 'cs_test', status: 'open', url: 'https://checkout.stripe.com/test' };
  } } } }) },
  '@/lib/server/request-guards': { enforceRateLimit: async () => true, getClientIp: () => 'test' },
  '@/lib/raffle-visibility': { getPublicRaffleCampaign: async code => {
    selected = code; return hidden ? null : { id: code, code, name: code === 'NDCCRRO' ? 'Reverse Raffle' : 'Dinos Trailer Raffle',
      price_cents: code === 'NDCCRRO' ? 6000 : 500, draw_label: code === 'NDCCRRO' ? null : 'Christmas Party - 19 December 2026' };
  } },
  '@/lib/payments/payment-config': { isCheckoutEnabled: () => true },
  '@/lib/payments/reference': { generateUniquePaymentReference: async () => 'NDCCRAF-2026-000100' },
  '@/lib/payments/site-url': { getCheckoutSiteUrl: () => 'https://www.ndcc.com.au' },
  '@/lib/order-input-validation': { PUBLIC_ORDER_LIMITS: { maximumOrderCents: 10000000 },
    readLimitedJsonObject: async () => ({ ok: true, value: input }), validateRaffleCheckoutInput: () => ({ ok: true, value: input }) },
  '@/lib/utils': { validateEmail: () => true, validatePhone: () => true },
});
for (const code of ['NDCCRRO', 'NDCCRAF']) {
  inserted = payload = null;
  const result = await route.POST({ url: `https://www.ndcc.com.au/api/raffle/checkout?campaign=${code}` });
  assert.equal(result.status, 200);
  assert.equal(selected, code);
  assert.equal(inserted.campaign_id, code);
  assert.equal(inserted.amount_cents, code === 'NDCCRRO' ? 12000 : 1000);
  assert.ok(payload.line_items[0].price_data.product_data.name.includes(code === 'NDCCRRO' ? 'Reverse Raffle' : 'Dinos Trailer Raffle'));
  assert.equal(payload.success_url, `https://www.ndcc.com.au/${code === 'NDCCRRO' ? 'reverse-raffle' : 'raffle'}?payment=success`);
  assert.equal(result.body.payment_reference, payload.client_reference_id);
  if (code === 'NDCCRRO') assert.equal(payload.line_items[0].price_data.product_data.description, undefined);
}
inserted = null; hidden = true;
assert.equal((await route.POST({ url: 'https://www.ndcc.com.au/api/raffle/checkout?campaign=NDCCRRO' })).status, 503);
assert.equal(inserted, null, 'Hidden campaign must not create an order');
assert.equal((await route.POST({ url: 'https://www.ndcc.com.au/api/raffle/checkout?campaign=OTHER' })).status, 400);

const ticket = load('lib/raffle-ticket.ts', {
  'node:fs/promises': { default: { readFile: async () => Buffer.from('test-logo') } },
  'node:path': { default: { join: (...parts) => parts.join('/') } },
  './server-fonts.mjs': { getServerSharp: async () => buffer => ({ png: () => ({ toBuffer: async () => buffer }) }) },
});
const zero = (await ticket.renderRaffleTicket('NDCCRRO-20260000')).toString();
assert.ok(zero.includes('NDCCRRO-20260000') && zero.includes('REVERSE RAFFLE') && zero.includes('$60.00 AUD'));
assert.ok(!zero.includes('19 DECEMBER') && !zero.includes('TRAILER'));
assert.ok((await ticket.renderRaffleTicket('NDCCRAF-260001')).toString().includes('$5.00 AUD'));
await assert.rejects(() => ticket.renderRaffleTicket('NDCCRRO-202600000'));
await assert.rejects(() => ticket.renderRaffleTicket('NDCCRRO-2026<script>'));
console.log('Reverse raffle: separate campaign/price/return URL, hidden and unknown rejection, zero ticket rendering, legacy ticket compatibility and invalid references passed. Database allocation and live Stripe remain untested.');
