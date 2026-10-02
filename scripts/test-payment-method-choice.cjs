// Payment method recording across every order type: Stripe checkout, bank
// transfer or pay at the club. Covers the purchaser "pay at the club" route,
// the committee route that sets or corrects the method on any order (past or
// present), the capability switch, the shared helpers, the all-orders export
// and the wiring into payment panels, merchandise checkout and card checkout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

class NextResponse extends Response { static json(body, init) { return new Response(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } }); } }
const id = '11111111-1111-4111-8111-111111111111';
const original = { id, order_category: 'membership', customer_email: 'buyer@example.invalid', payment_status: 'pending_bank_transfer', order_status: 'submitted', total_amount: 50, amount_paid: 0, balance_due: 50, deleted_at: null, bank_transfer_selected_at: null, bar_payment_selected_at: null, payment_method_choice: null };
let order = { ...original }, payAtClub = true, rate = true, fault = false, writes = [], audits = [], user = null;

function load(file, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, console, Request, Response, Headers, URL, Date, process: { env: {} },
    require(name) {
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/')) return load(path.resolve(name.slice(2) + '.ts'), mocks);
      if (name === 'server-only') return {};
      return require(name);
    },
  }, { filename: file });
  return exports;
}

const db = { from() { const predicates = []; let update; const q = {
  select: () => q,
  eq: (k, v) => { predicates.push(row => row[k] === v); return q; },
  is: (k, v) => { predicates.push(row => row[k] === v); return q; },
  neq: (k, v) => { predicates.push(row => row[k] !== v); return q; },
  update: value => { update = value; return q; },
  maybeSingle: async () => {
    if (fault) return { error: { message: 'private db error' }, data: null };
    if (!predicates.every(fn => fn(order))) return { data: null, error: null };
    if (update) { writes.push(update); order = { ...order, ...update }; }
    return { data: { ...order }, error: null };
  },
}; return q; } };

const mocks = {
  'next/server': { NextResponse },
  '@/lib/supabase-server': { createServerClient: () => db },
  '@/lib/server/request-guards': { enforceRateLimit: async () => rate, getClientIp: () => 'test' },
  '@/lib/order-input-validation': { readLimitedJsonObject: async request => ({ ok: true, value: await request.json() }) },
  '@/lib/payments/capabilities': { deriveCapabilities: () => ({ pay_at_club: payAtClub, bank_transfer: true }), loadMerchPaymentSettings: async () => ({}) },
  '@/lib/auth/guard': { requireAnyPermission: async () => user },
  '@/lib/auth/permissions': { hasPermission: (u, key) => Boolean(u && u.permissions.includes(key)) },
  '@/lib/revisions/server': { scheduleAdminAudit: input => audits.push(input) },
};
const req = (url, body) => new Request(`https://example.invalid${url}`, { method: 'POST', body: JSON.stringify(body) });

(async () => {
  // 1. Purchaser: pay at the club on a non-kitchen order.
  const club = load('app/api/payments/pay-at-club/route.ts', mocks);
  const call = body => club.POST(req('/api/payments/pay-at-club', { order_id: id, email: original.customer_email, ...body }));
  assert.equal((await call({ selected: true, email: 'other@example.invalid' })).status, 404, 'ownership by email');
  assert.equal(writes.length, 0);
  assert.equal((await call({ selected: 'yes' })).status, 400);
  assert.equal((await (await call({ action: 'read' })).json()).selected, false);
  order = { ...original, bank_transfer_selected_at: '2026-10-01T00:00:00Z' };
  const chosen = await call({ selected: true, amount_paid: 50, payment_status: 'paid' });
  assert.equal(chosen.status, 200);
  assert.ok(order.bar_payment_selected_at, 'club choice recorded');
  assert.equal(order.bank_transfer_selected_at, null, 'club choice replaces a bank choice');
  assert.equal(order.amount_paid, 0, 'intent only: money untouched');
  assert.equal(order.payment_status, 'pending_bank_transfer', 'intent only: status untouched');
  assert.deepEqual(Object.keys(writes.at(-1)).sort(), ['bank_transfer_selected_at', 'bar_payment_selected_at']);
  const first = order.bar_payment_selected_at;
  await call({ selected: true });
  assert.equal(order.bar_payment_selected_at, first, 'repeat selection keeps the original time');
  await call({ selected: false });
  assert.equal(order.bar_payment_selected_at, null);
  assert.deepEqual(Object.keys(writes.at(-1)), ['bar_payment_selected_at'], 'clearing touches only the club choice');
  payAtClub = false;
  assert.equal((await call({ selected: true })).status, 409, 'CMS switch off refuses new selections');
  assert.equal((await call({ selected: false })).status, 200, 'but a choice can always be removed');
  payAtClub = true;
  order = { ...original, order_category: 'kitchen' };
  assert.equal((await call({ selected: true })).status, 409, 'kitchen keeps its draft-token route');
  order = { ...original, order_category: 'spin_wheel' };
  assert.equal((await call({ selected: true })).status, 409, 'spins are card only');
  for (const status of ['paid', 'refunded', 'needs_review']) {
    order = { ...original, payment_status: status };
    assert.equal((await call({ selected: true })).status, 409, `${status} orders are not awaiting payment`);
  }
  order = { ...original, order_status: 'cancelled' };
  assert.equal((await call({ selected: true })).status, 409);
  order = { ...original, deleted_at: '2026-01-01' };
  assert.equal((await call({ selected: true })).status, 404);
  order = { ...original };
  fault = true;
  const failed = await call({ selected: true });
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /private db error/, 'database errors are not leaked');
  fault = false;
  rate = false;
  assert.equal((await call({ selected: true })).status, 429);
  rate = true;

  // 2. Committee: set or correct the method on any order, past or present.
  const admin = load('app/api/admin/orders/payment-choice/route.ts', mocks);
  const set = body => admin.POST(req('/api/admin/orders/payment-choice', { order_id: id, ...body }));
  user = null;
  assert.equal((await set({ method: 'pay_at_club' })).status, 403, 'signed-in committee access required');
  user = { id: '22222222-2222-4222-8222-222222222222', email: 'treasurer@example.invalid', permissions: ['orders'] };
  order = { ...original, payment_status: 'paid', amount_paid: 50, balance_due: 0 };
  assert.equal((await set({ method: 'cheque' })).status, 400);
  const paidAtClub = await set({ method: 'pay_at_club' });
  assert.equal(paidAtClub.status, 200, 'works on a paid (past) order');
  assert.equal(order.payment_method_choice, 'pay_at_club');
  assert.equal(order.payment_method_choice_source, 'admin');
  assert.equal(order.payment_method_choice_by, 'treasurer@example.invalid');
  assert.ok(order.bar_payment_selected_at && order.bank_transfer_selected_at === null, 'intent columns follow the choice');
  assert.equal(order.amount_paid, 50, 'money untouched');
  assert.equal(audits.length, 1);
  assert.match(audits[0].summary, /pay_at_club \(was not recorded\)/);
  await set({ method: 'bank_transfer' });
  assert.ok(order.bank_transfer_selected_at && order.bar_payment_selected_at === null);
  await set({ method: 'stripe' });
  assert.equal(order.payment_method_choice, 'stripe');
  assert.ok(order.bank_transfer_selected_at === null && order.bar_payment_selected_at === null);
  await set({ method: null });
  assert.equal(order.payment_method_choice, null);
  assert.equal(order.payment_method_choice_source, null);
  user = { id: '33333333-3333-4333-8333-333333333333', email: 'kitchen@example.invalid', permissions: ['kitchen'] };
  assert.equal((await set({ method: 'pay_at_club' })).status, 403, 'kitchen access cannot change other orders');
  order = { ...original, order_category: 'kitchen' };
  assert.equal((await set({ method: 'pay_at_club' })).status, 200, 'kitchen access covers kitchen orders ("paid at the bar")');
  assert.equal(order.payment_method_choice, 'pay_at_club');
  assert.equal((await admin.POST(req('/api/admin/orders/payment-choice', { order_id: 'not-a-uuid', method: 'stripe' }))).status, 400);

  // 3. Capability: pay at the club is on by default and follows its CMS switch.
  const capabilities = load('lib/payments/capabilities.ts', { '@/lib/payments/payment-config': { isCheckoutEnabled: () => false } });
  assert.equal(capabilities.deriveCapabilities(capabilities.DEFAULT_SETTINGS).pay_at_club, true);
  assert.equal(capabilities.deriveCapabilities({ ...capabilities.DEFAULT_SETTINGS, pay_at_club_enabled: false }).pay_at_club, false);
  const reads = [];
  const settings = await capabilities.loadMerchPaymentSettings({ from: () => ({ select: columns => { reads.push(columns); return { maybeSingle: async () => reads.length === 1
    ? { data: null, error: { message: 'column merch_payment_settings.pay_at_club_enabled does not exist' } }
    : { data: { bank_transfer_enabled: true, card_checkout_enabled: false, partial_payments_enabled: false, minimum_partial_amount: 10, required_deposit_percent: null }, error: null } }; } }) });
  assert.ok(reads[0].includes('pay_at_club_enabled') && !reads[1].includes('pay_at_club_enabled'), 'falls back before the migration');
  assert.equal(settings.bank_transfer_enabled, true, 'a missing new column never disables bank transfer');
  assert.equal(capabilities.deriveCapabilities(settings).pay_at_club, false, 'off until the migration adds the switch (the old database allows kitchen only)');

  // 4. Shared helpers.
  const choice = load('lib/payments/method-choice.ts');
  assert.equal(choice.effectivePaymentChoice({ payment_method_choice: 'stripe', bank_transfer_selected_at: 'x' }), 'stripe');
  assert.equal(choice.effectivePaymentChoice({ bar_payment_selected_at: 'x', bank_transfer_selected_at: 'y' }), 'pay_at_club');
  assert.equal(choice.effectivePaymentChoice({ bank_transfer_selected_at: 'y' }), 'bank_transfer');
  assert.equal(choice.effectivePaymentChoice({}), null);
  assert.equal(choice.paymentChoiceLabel({}), 'Not recorded');
  const patch = choice.paymentChoicePatch({ bar_payment_selected_at: '2026-09-01T00:00:00Z' }, 'pay_at_club', 'a@example.invalid', '2026-10-02T00:00:00Z');
  assert.equal(patch.bar_payment_selected_at, '2026-09-01T00:00:00Z', 'keeps the earlier selection time');

  // 5. All-orders export: every category, paid and unpaid, stated and settled methods.
  const exporter = load('lib/orders/all-orders-export.ts');
  const rows = exporter.buildAllOrdersExportRows([
    { id: 'k1', created_at: '2026-09-17T08:00:00Z', payment_reference: 'NDCCKIT-2026-000001', order_category: 'kitchen', customer_name: 'Sam', total_amount: 24, amount_paid: 24, balance_due: 0, payment_status: 'paid', payment_method_choice: 'pay_at_club', payment_method_choice_source: 'admin', payment_method_choice_by: 'kitchen@example.invalid', items: [{ name: 'Roast', size: 'kitchen', quantity: 2 }] },
    { id: 'm1', created_at: '2026-09-18T08:00:00Z', payment_reference: 'NDCCMEM-2026-000002', order_category: 'membership', customer_name: '=cmd', total_amount: 50, amount_paid: 0, balance_due: 50, payment_status: 'pending_bank_transfer', bar_payment_selected_at: '2026-09-18T09:00:00Z' },
    { id: 'e1', created_at: '2026-09-19T08:00:00Z', order_category: 'event', total_amount: 10, payment_status: 'pending_bank_transfer' },
  ], [
    { order_id: 'k1', method: 'cash', status: 'settled', amount: 24 },
    { order_id: 'k1', method: 'stripe', status: 'void', amount: 24 },
  ]);
  const col = name => exporter.ALL_ORDERS_EXPORT_HEADER.indexOf(name);
  assert.equal(rows.length, 4, 'header plus one row per order, unpaid included');
  assert.equal(rows[1][col('stated_payment_method')], 'Pay at the club');
  assert.equal(rows[1][col('stated_method_set_by')], 'Committee (kitchen@example.invalid)');
  assert.equal(rows[1][col('paid_by')], 'Cash or card at the club', 'void ledger rows are ignored');
  assert.equal(rows[1][col('paid_cash_or_card_at_club_aud')], '24.00');
  assert.equal(rows[1][col('paid_stripe_aud')], '');
  assert.equal(rows[1][col('items')], 'Roast x2');
  assert.equal(rows[2][col('stated_payment_method')], 'Pay at the club', 'falls back to the intent column');
  assert.equal(rows[2][col('balance_due_aud')], '50.00');
  assert.equal(rows[3][col('stated_payment_method')], 'Not recorded');
  assert.equal(rows[3][col('order_reference')], 'e1');
  const csv = load('lib/csv.ts');
  assert.ok(csv.toCsv(rows).includes("'=cmd"), 'customer text is formula-protected by the shared CSV writer');

  // 6. Wiring.
  const panel = fs.readFileSync('components/payments/OrderPaymentOptions.tsx', 'utf8');
  assert.match(panel, /!mealDraftToken && orderId && customerEmail && capabilities\.pay_at_club && totalAmount > 0 && \(\s*<PayAtClubChoice/);
  const merchRoute = fs.readFileSync('app/api/orders/route.ts', 'utf8');
  assert.match(merchRoute, /payment_method !== 'pay_at_club'/);
  assert.match(merchRoute, /payment_method === 'pay_at_club' \? capabilities\.pay_at_club/);
  assert.match(merchRoute, /bar_payment_selected_at: new Date\(\)\.toISOString\(\)/);
  assert.match(fs.readFileSync('app/merchandise/components/CheckoutForm.tsx', 'utf8'), /value="pay_at_club"/);
  assert.match(fs.readFileSync('app/api/payments/checkout-session/route.ts', 'utf8'), /payment_method_choice: 'stripe'/, 'card checkout records Stripe');
  assert.match(fs.readFileSync('app/api/payments/bank-transfer/route.ts', 'utf8'), /order\.category === 'kitchen' \|\| order\.bar_payment_selected_at|order\.order_category === 'kitchen' \|\| order\.bar_payment_selected_at/, 'a bank choice clears a club choice on any order');
  assert.match(fs.readFileSync('app/api/admin/resources/[resource]/route.ts', 'utf8'), /'pay_at_club_enabled'\]/, 'CMS switch is writable');
  const migration = fs.readFileSync('supabase/migrations/20261002100000_payment_method_choice_and_pay_at_club.sql', 'utf8');
  assert.match(migration, /drop constraint if exists orders_bar_payment_kitchen_only/);
  assert.match(migration, /payment_method_choice in \('stripe', 'bank_transfer', 'pay_at_club'\)/);
  assert.match(migration, /create trigger orders_sync_payment_method_choice/);
  assert.match(migration, /pay_at_club_enabled boolean not null default true/);
  assert.match(fs.readFileSync('scripts/test-migration-replay.mjs', 'utf8'), /test-payment-method-choice\.sql/, 'database behaviour runs in the migration replay');

  console.log('PASS: pay at the club on any order, committee method changes on past and present orders with audit, CMS switch with pre-migration fallback, helpers, all-orders export and wiring.');
})().catch(error => { console.error(error); process.exit(1); });
