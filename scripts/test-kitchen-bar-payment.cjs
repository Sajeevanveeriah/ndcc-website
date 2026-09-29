// Kitchen "pay cash at the bar" choice: route authorisation, intent-only
// writes, bank-choice replacement, and the kitchen payment panel wiring.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
class NextResponse extends Response { static json(body, init) { return new Response(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } }); } }
const id = '11111111-1111-4111-8111-111111111111';
const token = '22222222-2222-4222-8222-222222222222';
const original = { id, meal_draft_token: token, order_category: 'kitchen', payment_status: 'pending_bank_transfer', order_status: 'submitted', total_amount: 24, amount_paid: 0, balance_due: 24, deleted_at: null, bar_payment_selected_at: null, bank_transfer_selected_at: '2026-09-29T08:00:00.000Z' };
let order = { ...original }, rate = true, fault = false, writes = [], limits = [];
function load(file, mocks) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, console, Request, Response, Headers, URL, Date, require(name) { if (name in mocks) return mocks[name]; if (name.startsWith('@/')) return load(path.resolve(name.slice(2) + '.ts'), mocks); return require(name); } }, { filename: file });
  return exports;
}
const db = { from(table) { assert.equal(table, 'orders'); const predicates = []; let update; const q = {
  select: () => q, update: value => { update = value; return q; },
  eq: (k, v) => { predicates.push(row => row[k] === v); return q; }, is: (k, v) => { predicates.push(row => row[k] === v); return q; }, neq: (k, v) => { predicates.push(row => row[k] !== v); return q; },
  maybeSingle: async () => {
    if (fault) return { data: null, error: { message: 'private db error' } };
    if (!predicates.every(fn => fn(order))) return { data: null, error: null };
    if (update) { writes.push(update); order = { ...order, ...update }; }
    return { data: order, error: null };
  },
}; return q; } };
const route = load('app/api/kitchen/orders/bar-payment/route.ts', {
  'next/server': { NextResponse }, '@/lib/supabase-server': { createServerClient: () => db },
  '@/lib/server/request-guards': { enforceRateLimit: async key => { limits.push(key); return rate; }, getClientIp: () => 'test' },
  '@/lib/order-input-validation': { readLimitedJsonObject: async request => ({ ok: true, value: await request.json() }) },
});
const call = body => route.POST(new Request('https://example.invalid/api/kitchen/orders/bar-payment', { method: 'POST', body: JSON.stringify({ order_id: id, draft_token: token, ...body }) }));
(async () => {
  // The draft token is the authority: a wrong token or order id finds nothing and writes nothing.
  assert.equal((await call({ draft_token: '33333333-3333-4333-8333-333333333333', selected: true })).status, 404);
  assert.equal((await call({ order_id: '44444444-4444-4444-8444-444444444444', selected: true })).status, 404);
  assert.equal((await call({ draft_token: 'not-a-token', selected: true })).status, 400);
  assert.equal((await call({ selected: 'yes' })).status, 400);
  assert.equal(writes.length, 0);
  order = { ...original, order_category: 'merch' };
  assert.equal((await call({ selected: true })).status, 404, 'only kitchen orders can choose the bar');
  order = { ...original };
  const read = await call({ action: 'read' });
  assert.equal(read.status, 200); assert.equal((await read.json()).selected, false);
  assert.match(read.headers.get('Cache-Control'), /no-store/);
  assert.ok(limits.pop().startsWith('bar-payment-read:'), 'reads use the looser read bucket');

  const chosen = await call({ selected: true });
  assert.equal(chosen.status, 200); assert.equal((await chosen.json()).selected, true);
  assert.ok(limits.pop().startsWith('bar-payment:'), 'changes use the stricter bucket');
  assert.ok(order.bar_payment_selected_at, 'bar choice recorded');
  assert.equal(order.bank_transfer_selected_at, null, 'bar choice replaces a bank deposit choice');
  assert.equal(order.payment_status, 'pending_bank_transfer', 'intent never settles payment');
  assert.equal(order.amount_paid, 0);
  const first = order.bar_payment_selected_at;
  await call({ selected: true });
  assert.equal(order.bar_payment_selected_at, first, 'repeat selection keeps the original time');
  assert.equal((await (await call({ action: 'read' })).json()).selected, true);

  const cleared = await call({ selected: false });
  assert.equal(cleared.status, 200); assert.equal(order.bar_payment_selected_at, null);
  assert.deepEqual(Object.keys(writes.at(-1)), ['bar_payment_selected_at'], 'clearing touches only the bar choice');

  for (const change of [{ payment_status: 'paid' }, { order_status: 'cancelled' }, { balance_due: 0 }]) {
    order = { ...original, ...change }; const count = writes.length;
    assert.equal((await call({ selected: true })).status, 409, JSON.stringify(change));
    assert.equal(writes.length, count);
  }
  order = { ...original, deleted_at: '2026-09-29T09:00:00.000Z' };
  assert.equal((await call({ selected: true })).status, 404, 'deleted orders are not found');
  order = { ...original };
  fault = true;
  const failed = await call({ selected: true });
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /private db error/);
  fault = false; rate = false;
  assert.equal((await call({ selected: true })).status, 429);
  rate = true;

  // Panel wiring: only the kitchen (meal draft token) shows the bar choice, and a bar choice hides the bank deposit panel.
  const panel = fs.readFileSync('components/payments/OrderPaymentOptions.tsx', 'utf8');
  assert.match(panel, /mealDraftToken && orderId && \(\s*<BarPaymentChoice/);
  assert.match(panel, /!barSelected && capabilities\.bank_transfer/);
  const choice = fs.readFileSync('components/payments/BarPaymentChoice.tsx', 'utf8');
  assert.match(choice, /I will pay cash at the bar/);
  assert.match(choice, /\/api\/kitchen\/orders\/bar-payment/);
  const migration = fs.readFileSync('supabase/migrations/20260929120000_kitchen_bar_payment_selection.sql', 'utf8');
  assert.match(migration, /add column bar_payment_selected_at timestamptz/);
  assert.match(migration, /bar_payment_selected_at is null or order_category = 'kitchen'/);
  const exportRoute = fs.readFileSync('app/api/admin/kitchen/orders/export/route.ts', 'utf8');
  assert.match(exportRoute, /bar_payment_selected_at/);
  console.log('PASS: kitchen pay-at-bar authorisation, intent-only writes, bank replacement, payable guards, errors, rate limits, panel and export wiring.');
})().catch(error => { console.error(error); process.exit(1); });
