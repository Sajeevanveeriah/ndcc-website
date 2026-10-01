// Kitchen special requests: the optional request is validated and bounded, an
// order carrying one is pay-at-the-bar only (the kitchen prices it on the
// night), and card or bank payment of the listed total is refused server-side
// and hidden in the payment panel.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

class NextResponse extends Response { static json(body, init) { return new Response(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } }); } }

function load(file, mocks = {}, globals = {}) {
  const resolved = ['', '.tsx', '.ts'].map(ext => file + ext).find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!resolved) throw new Error(`Cannot resolve ${file}`);
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, module: { exports }, console, Request, Response, Headers, URL, Date, setTimeout, clearTimeout, ...globals, require(name) {
    if (name in mocks) return mocks[name];
    if (name.startsWith('@/')) return load(path.resolve(name.slice(2)), mocks, globals);
    if (name.startsWith('.')) return load(path.resolve(path.dirname(resolved), name), mocks, globals);
    return require(name);
  } }, { filename: resolved });
  return exports;
}

const id = '11111111-1111-4111-8111-111111111111';
const token = '22222222-2222-4222-8222-222222222222';
const SPECIAL = { name: 'Sam', email: 'sam@example.invalid', phone: '0400000000', collection_window: 'seniors', items: [], special_request: 'Gluten free roast, no gravy' };
const base = { id, meal_draft_token: token, customer_email: 'sam@example.invalid', order_category: 'kitchen', payment_status: 'pending_bank_transfer', order_status: 'submitted', total_amount: 24, amount_paid: 0, balance_due: 24, deleted_at: null, bar_payment_selected_at: '2026-10-01T05:00:00.000Z', bank_transfer_selected_at: null, meal_request: SPECIAL };
let order, writes;
const db = { from(table) { assert.equal(table, 'orders'); const predicates = []; let update; const q = {
  select: () => q, update: value => { update = value; return q; },
  eq: (k, v) => { predicates.push(row => row[k] === v); return q; }, is: (k, v) => { predicates.push(row => row[k] === v); return q; }, neq: (k, v) => { predicates.push(row => row[k] !== v); return q; },
  maybeSingle: async () => {
    if (!predicates.every(fn => fn(order))) return { data: null, error: null };
    if (update) { writes.push(update); order = { ...order, ...update }; }
    return { data: order, error: null };
  },
}; return q; } };
const serverMocks = {
  'next/server': { NextResponse }, '@/lib/supabase-server': { createServerClient: () => db },
  '@/lib/server/request-guards': { enforceRateLimit: async () => true, getClientIp: () => 'test' },
  '@/lib/order-input-validation': { readLimitedJsonObject: async request => ({ ok: true, value: await request.json() }) },
  '@/lib/payments/capabilities': { deriveCapabilities: () => ({ bank_transfer: true, card: true }), loadMerchPaymentSettings: async () => ({}) },
  '@/lib/payments/bank-transfer': { configuredBankDetails: () => ({ account_name: 'TEST', bsb: '000000', account_number: '00000000' }), TRANSFER_PAYABLE_STATUSES: ['pending_bank_transfer', 'unpaid', 'partially_paid'] },
};
const post = (route, url, body) => route.POST(new Request(`https://example.invalid${url}`, { method: 'POST', body: JSON.stringify(body) }));

(async () => {
  // 1. Input validation: optional, trimmed, bounded and string-only.
  const { validateKitchenOrderInput, PUBLIC_ORDER_LIMITS } = load(path.resolve('lib/order-input-validation'));
  const input = { customer_name: 'Sam', customer_email: 'sam@example.invalid', customer_phone: '0400000000', items: [{ item_id: 'roast', quantity: 1 }], hp_field: '', submitted_at: Date.now() - 10_000 };
  let parsed = validateKitchenOrderInput(input);
  assert.equal(parsed.ok, true); assert.equal(parsed.value.specialRequest, '', 'absent request is empty');
  parsed = validateKitchenOrderInput({ ...input, special_request: '  No onion please  ' });
  assert.equal(parsed.value.specialRequest, 'No onion please');
  assert.equal(PUBLIC_ORDER_LIMITS.kitchenSpecialRequestLength, 500);
  assert.equal(validateKitchenOrderInput({ ...input, special_request: 'x'.repeat(500) }).ok, true);
  const tooLong = validateKitchenOrderInput({ ...input, special_request: 'x'.repeat(501) });
  assert.equal(tooLong.ok, false); assert.equal(tooLong.error, 'Special request is too long.');
  assert.equal(validateKitchenOrderInput({ ...input, special_request: { text: 'x' } }).ok, false);
  assert.equal(validateKitchenOrderInput({ ...input, special_request: 'x', items: [] }).ok, false, 'a request still needs at least one menu item');

  // 2. Helper: only kitchen orders with a non-blank request are bar-only.
  const helper = load(path.resolve('lib/kitchen-special-request'));
  assert.equal(helper.kitchenOrderIsBarOnly(base), true);
  assert.equal(helper.kitchenOrderIsBarOnly({ ...base, meal_request: { ...SPECIAL, special_request: '   ' } }), false);
  assert.equal(helper.kitchenOrderIsBarOnly({ ...base, meal_request: null }), false);
  assert.equal(helper.kitchenOrderIsBarOnly({ ...base, order_category: 'merch' }), false);
  assert.equal(helper.kitchenSpecialRequest(['special_request']), '');

  // 3. Bar route: the bar choice of a special request cannot be removed; ordinary orders still can.
  const bar = load('app/api/kitchen/orders/bar-payment/route.ts', serverMocks);
  order = { ...base }; writes = [];
  const read = await post(bar, '/api/kitchen/orders/bar-payment', { order_id: id, draft_token: token, action: 'read' });
  const readBody = await read.json(); assert.equal(readBody.selected, true); assert.equal(readBody.bar_only, true);
  const removed = await post(bar, '/api/kitchen/orders/bar-payment', { order_id: id, draft_token: token, selected: false });
  assert.equal(removed.status, 409); assert.match((await removed.json()).error, /special request/);
  assert.equal(writes.length, 0, 'refusal writes nothing');
  order = { ...base, bar_payment_selected_at: null };
  assert.equal((await post(bar, '/api/kitchen/orders/bar-payment', { order_id: id, draft_token: token, selected: true })).status, 200, 'a missed default can be saved');
  assert.ok(order.bar_payment_selected_at);
  order = { ...base, meal_request: { ...SPECIAL, special_request: undefined } }; writes = [];
  assert.equal((await post(bar, '/api/kitchen/orders/bar-payment', { order_id: id, draft_token: token, selected: false })).status, 200, 'ordinary orders can still untick');

  // 4. Bank route: a special request cannot switch to a deposit of the listed total.
  const bank = load('app/api/payments/bank-transfer/route.ts', serverMocks);
  order = { ...base }; writes = [];
  const deposit = await post(bank, '/api/payments/bank-transfer', { order_id: id, email: 'sam@example.invalid', selected: true });
  assert.equal(deposit.status, 409); assert.match((await deposit.json()).error, /special request/);
  assert.equal(writes.length, 0); assert.ok(order.bar_payment_selected_at, 'bar choice kept');
  order = { ...base, meal_request: { ...SPECIAL, special_request: '' } };
  assert.equal((await post(bank, '/api/payments/bank-transfer', { order_id: id, email: 'sam@example.invalid', selected: true })).status, 200, 'ordinary kitchen orders keep bank transfer');

  // 5. Card checkout and order save: source wiring.
  const checkout = fs.readFileSync('app/api/payments/checkout-session/route.ts', 'utf8');
  assert.match(checkout, /meal_request,deleted_at'\)/, 'checkout reads the meal request');
  assert.ok(checkout.indexOf('kitchenOrderIsBarOnly(order)') > 0 && checkout.indexOf('kitchenOrderIsBarOnly(order)') < checkout.indexOf('reserve_meal_stripe_payment'), 'card refused before any reservation');
  const save = fs.readFileSync('app/api/kitchen/orders/route.ts', 'utf8');
  assert.match(save, /\.\.\.\(special_request \? \{ special_request \} : \{\}\)/, 'request stored only when entered');
  assert.match(save, /bar_payment_selected_at: saved\.bar_payment_selected_at \|\| new Date\(\)\.toISOString\(\), bank_transfer_selected_at: null/, 'defaults to pay at the bar');
  assert.match(save, /escapeEmailHtml\(special_request\)/, 'request is escaped in email');
  assert.match(save, /bank_details: kitchenSpecialRequest\(order\.meal_request\) \? null : configuredBankDetails\(\)/, 'no bank details for a special request');
  const reconcile = fs.readFileSync('app/api/admin/payments/reconcile/route.ts', 'utf8');
  assert.match(reconcile, /order_category, meal_request'\)/, 'reconciliation reads the meal request');
  assert.match(reconcile, /\.filter\(\(order\) => !kitchenOrderIsBarOnly\(order\)\)/, 'special requests are never auto-settled from a bank statement');
  assert.ok(reconcile.indexOf('kitchenOrderIsBarOnly(order)') < reconcile.indexOf('confirm_imported_order_payment'));
  const exportRoute = fs.readFileSync('app/api/admin/kitchen/orders/export/route.ts', 'utf8');
  assert.match(exportRoute, /meal_request'/); assert.match(exportRoute, /special_request: kitchenSpecialRequest\(meal_request\)/);

  // 6. Payment panel: bar-only shows a locked bar choice, no bank deposit and no card button,
  //    and re-saves a missing bar choice.
  let server = { bar: false }; const requests = [];
  async function fetchMock(url, options = {}) {
    const body = options.body ? JSON.parse(options.body) : {};
    requests.push({ url, body });
    const reply = data => ({ ok: true, json: async () => data });
    if (url.startsWith('/api/payments/capabilities')) return reply({ data: { bank_transfer: true, card: true } });
    if (url === '/api/kitchen/orders/bar-payment') {
      if (body.action === 'read') return reply({ selected: server.bar, bar_only: true });
      server.bar = body.selected; return reply({ selected: server.bar, message: 'Pay at the bar selected.' });
    }
    throw new Error(`Unexpected fetch ${url}`);
  }
  const Panel = load(path.resolve('components/payments/OrderPaymentOptions'), {}, { fetch: fetchMock, window: {} }).default;
  const props = { mealDraftToken: token, mealRevision: 1, orderId: id, customerEmail: 'sam@example.invalid', totalAmount: 24, paymentReference: 'NDCCKIT-TEST', bankDetails: { account_name: 'TEST', bsb: '000000', account_number: '00000000' }, returnPath: '/kitchen' };
  const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
  const text = node => (typeof node === 'string' ? node : (node.children || []).map(text).join(''));
  let tree;
  await act(async () => { tree = create(React.createElement(Panel, { ...props, barOnly: true })); });
  await flush();
  const boxes = tree.root.findAll(node => node.type === 'input' && node.props.type === 'checkbox');
  assert.equal(boxes.length, 1, 'only the bar choice is offered');
  assert.equal(boxes[0].props.checked, true); assert.equal(boxes[0].props.disabled, true);
  assert.ok(!tree.root.findAll(node => node.type === 'button').some(button => text(button).includes('securely online')), 'no card button');
  assert.ok(!text(tree.root).includes('Bank transfer details'), 'no bank details');
  assert.ok(requests.some(request => request.url === '/api/kitchen/orders/bar-payment' && request.body.selected === true), 'missing bar choice saved on load');
  assert.equal(server.bar, true);

  server = { bar: false }; requests.length = 0;
  await act(async () => { tree = create(React.createElement(Panel, props)); });
  await flush();
  assert.ok(tree.root.findAll(node => node.type === 'button').some(button => text(button).includes('securely online')), 'ordinary orders keep card payment');
  assert.ok(!requests.some(request => request.body.selected !== undefined), 'ordinary orders never auto-select the bar');

  console.log('PASS: special request validation, bar-only helper, bar/bank/card refusals, save wiring, export mapping and bar-only payment panel.');
})().catch(error => { console.error(error); process.exit(1); });
