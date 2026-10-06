// A purchaser who chose to pay at the club (bar) or by bank transfer is not
// offered "pay online": the payment panels hide the card button while either
// choice is ticked and show it again once it is unticked, the server refuses
// card checkout for such orders, and balance reminders send no Stripe link.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

let server;
async function fetchMock(url, options = {}) {
  const body = options.body ? JSON.parse(options.body) : {};
  const reply = data => ({ ok: true, json: async () => data });
  if (url.startsWith('/api/payments/capabilities')) return reply({ data: { bank_transfer: true, card: true, pay_at_club: true } });
  if (url === '/api/kitchen/orders/bar-payment' || url === '/api/payments/pay-at-club') {
    if (body.action === 'read') return reply({ selected: server.bar });
    server.bar = body.selected; if (body.selected) server.bank = false;
    return reply({ selected: server.bar, message: 'Saved.' });
  }
  if (url === '/api/payments/bank-transfer') {
    if (body.action === 'read') return reply({ selected: server.bank });
    server.bank = body.selected; if (body.selected) server.bar = false;
    return reply({ selected: server.bank, message: 'Saved.' });
  }
  throw new Error(`Unexpected fetch ${url}`);
}
const cache = new Map();
function load(file) {
  const resolved = ['', '.tsx', '.ts'].map(ext => file + ext).find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!resolved) throw new Error(`Cannot resolve ${file}`);
  if (cache.has(resolved)) return cache.get(resolved);
  const exports = {}; cache.set(resolved, exports);
  const code = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, module: { exports }, fetch: fetchMock, console, window: {}, setTimeout, clearTimeout, require(name) {
    if (name.startsWith('@/')) return load(path.resolve(name.slice(2)));
    if (name.startsWith('.')) return load(path.resolve(path.dirname(resolved), name));
    return require(name);
  } }, { filename: resolved });
  return exports;
}
const Panel = load(path.resolve('components/payments/OrderPaymentOptions')).default;
const MerchPanel = load(path.resolve('app/merchandise/components/OrderConfirmationPanel')).default;
const { offlineChoiceBlockingCard } = load(path.resolve('lib/payments/method-choice'));
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const hasButton = (tree, words) => tree.root.findAll(node => node.type === 'button').some(button => text(button).includes(words));
const boxes = tree => tree.root.findAll(node => node.type === 'input' && node.props.type === 'checkbox');
const byLabel = (tree, words) => boxes(tree).find(box => box.parent.children.filter(child => typeof child === 'string').join(' ').includes(words));
async function toggle(tree, label, checked) {
  await act(async () => { byLabel(tree, label).props.onChange({ target: { checked } }); });
  await flush();
}
const base = { orderId: '44444444-4444-4444-8444-444444444444', customerEmail: 'buyer@example.invalid', totalAmount: 6, paymentReference: 'NDCC-TEST', bankDetails: { account_name: 'TEST ONLY', bsb: '000000', account_number: '00000000' }, returnPath: '/events' };

(async () => {
  // 1. Helper: intent columns decide; no choice keeps card.
  assert.equal(offlineChoiceBlockingCard({}), null);
  assert.equal(offlineChoiceBlockingCard({ bar_payment_selected_at: '2026-10-01T00:00:00Z' }), 'pay_at_club');
  assert.equal(offlineChoiceBlockingCard({ bank_transfer_selected_at: '2026-10-01T00:00:00Z' }), 'bank_transfer');
  assert.equal(offlineChoiceBlockingCard({ payment_method_choice: 'bank_transfer', bank_transfer_selected_at: null }), null, 'unticked choice no longer blocks card');

  // 2. Kitchen panel: bar and bank each hide card; unticking restores it.
  server = { bar: false, bank: false };
  let tree;
  await act(async () => { tree = create(React.createElement(Panel, { ...base, mealDraftToken: '33333333-3333-4333-8333-333333333333', mealRevision: 1, returnPath: '/kitchen' })); });
  await flush();
  assert.ok(hasButton(tree, 'securely online'), 'card offered when no offline choice is made');
  await toggle(tree, 'I will pay cash at the bar', true);
  assert.ok(!hasButton(tree, 'securely online'), 'bar choice hides card');
  await toggle(tree, 'I will pay cash at the bar', false);
  assert.ok(hasButton(tree, 'securely online'), 'unticking the bar restores card');
  await toggle(tree, 'I am paying by bank transfer', true);
  assert.ok(!hasButton(tree, 'securely online'), 'bank choice hides card');
  await toggle(tree, 'I am paying by bank transfer', false);
  assert.ok(hasButton(tree, 'securely online'), 'unticking bank restores card');
  await act(async () => tree.unmount());

  // 3. Events/snails/membership panel: pay at the club hides card; a stored bank choice hides it on load.
  server = { bar: false, bank: false };
  await act(async () => { tree = create(React.createElement(Panel, base)); });
  await flush();
  assert.ok(hasButton(tree, 'securely online'));
  await toggle(tree, 'I will pay at the club', true);
  assert.ok(!hasButton(tree, 'securely online'), 'pay at the club hides card');
  await act(async () => tree.unmount());
  server = { bar: false, bank: true };
  await act(async () => { tree = create(React.createElement(Panel, base)); });
  await flush();
  assert.ok(!hasButton(tree, 'securely online'), 'stored bank choice hides card on load');
  await act(async () => tree.unmount());

  // 4. Donations chose bank before the panel loads: never flashes card.
  server = { bar: false, bank: true };
  await act(async () => { tree = create(React.createElement(Panel, { ...base, bankTransferChosen: true })); });
  assert.ok(!hasButton(tree, 'securely online'), 'bank-chosen donation never shows card');
  await act(async () => tree.unmount());

  // 5. Merchandise confirmation: either offline choice hides "Pay full amount online".
  const merchProps = choice => ({
    orderConfirmation: { order_id: base.orderId, customer_email: base.customerEmail, payment_reference: 'NDCC-MERCH', total_amount: 40, bank_details: base.bankDetails },
    capabilities: { bank_transfer: true, card: true, pay_at_club: true, partial_payments: false, minimum_partial_amount: 10 },
    cardPaying: false, cardAmount: '', setCardAmount() {}, cardError: '', setCardError() {}, startCardPayment() {}, ...choice,
  });
  for (const [label, state] of [['bank', { bar: false, bank: true }], ['club', { bar: true, bank: false }]]) {
    server = state;
    await act(async () => { tree = create(React.createElement(MerchPanel, merchProps())); });
    await flush();
    assert.ok(!hasButton(tree, 'Pay full amount online'), `merch ${label} choice hides card`);
    await act(async () => tree.unmount());
  }
  server = { bar: false, bank: false };
  await act(async () => { tree = create(React.createElement(MerchPanel, merchProps())); });
  await flush();
  assert.ok(hasButton(tree, 'Pay full amount online'), 'merch with no offline choice keeps card');
  await act(async () => tree.unmount());

  // 6. Server and email wiring.
  const checkout = fs.readFileSync('app/api/payments/checkout-session/route.ts', 'utf8');
  assert.match(checkout, /bank_transfer_selected_at,bar_payment_selected_at,deleted_at'\)/, 'checkout reads both intent columns');
  assert.ok(checkout.indexOf('offlineChoiceBlockingCard(order)') > 0 && checkout.indexOf('offlineChoiceBlockingCard(order)') < checkout.indexOf('reserve_meal_stripe_payment'), 'checkout refuses card before reserving a Stripe payment');
  const balance = fs.readFileSync('app/api/payments/balance/route.ts', 'utf8');
  assert.ok(balance.indexOf('offlineChoiceBlockingCard(order)') > 0 && balance.indexOf('offlineChoiceBlockingCard(order)') < balance.indexOf('return createCheckout('), 'balance checkout refuses card first');
  const reminders = fs.readFileSync('lib/payments/balance-reminders.ts', 'utf8');
  assert.match(reminders, /offlineChoiceBlockingCard\(order\)/, 'reminders check the stated method');
  assert.match(reminders, /bank_transfer_selected_at,bar_payment_selected_at/, 'reminders read both intent columns');
  const purchases = fs.readFileSync('components/club-account/MemberPurchases.tsx', 'utf8');
  assert.match(purchases, /!order\.bank_transfer_selected && !order\.pay_at_club_selected && <Button/, 'club account hides the card balance button');
  const balanceUi = fs.readFileSync('components/payments/BalancePayment.tsx', 'utf8');
  assert.match(balanceUi, /order\.capabilities\.card && !bankSelected && !order\.pay_at_club_selected/, 'pay-balance hides card for offline choices');

  console.log('PASS: bar and bank choices hide pay online (kitchen, events, merch, donations, club account, pay-balance), unticking restores it, server refuses card, reminders send no Stripe link.');
})().catch(error => { console.error(error); process.exit(1); });
