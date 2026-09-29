// Kitchen payment panel: the pay-at-the-bar and bank-deposit controls are
// serialised (one locked while the other saves) and both re-read the stored
// choice after either saves, so the page always matches the server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

let server, requests, gate;
async function fetchMock(url, options = {}) {
  const body = options.body ? JSON.parse(options.body) : {};
  requests.push({ url, body });
  const reply = data => ({ ok: true, json: async () => data });
  if (url.startsWith('/api/payments/capabilities')) return reply({ data: { bank_transfer: true, card: false } });
  if (gate && body.action !== 'read') await gate.promise;
  if (url === '/api/kitchen/orders/bar-payment') {
    if (body.action === 'read') return reply({ selected: server.bar });
    server.bar = body.selected; if (body.selected) server.bank = false;
    return reply({ selected: server.bar, message: 'Bar saved.' });
  }
  if (url === '/api/payments/bank-transfer') {
    if (body.action === 'read') return reply({ selected: server.bank });
    server.bank = body.selected; if (body.selected) server.bar = false;
    return reply({ selected: server.bank, message: 'Bank saved.' });
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
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
const boxes = tree => tree.root.findAll(node => node.type === 'input' && node.props.type === 'checkbox');
const labelText = box => box.parent.children.filter(child => typeof child === 'string').join(' ');
const byLabel = (tree, text) => boxes(tree).find(box => labelText(box).includes(text));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const props = { mealDraftToken: '33333333-3333-4333-8333-333333333333', mealRevision: 1, orderId: '44444444-4444-4444-8444-444444444444', customerEmail: 'buyer@example.invalid', totalAmount: 6, paymentReference: 'NDCCKIT-TEST', bankDetails: { account_name: 'TEST ONLY', bsb: '000000', account_number: '00000000' }, returnPath: '/kitchen' };

(async () => {
  server = { bar: false, bank: false }; requests = []; gate = null;
  let tree;
  await act(async () => { tree = create(React.createElement(Panel, props)); });
  await flush();
  const bar = () => byLabel(tree, 'I will pay cash at the bar');
  const bank = () => byLabel(tree, 'I am paying by bank transfer');
  assert.ok(bar() && bank(), 'both choices shown for a kitchen order');
  assert.equal(bar().props.disabled, false); assert.equal(bank().props.disabled, false);

  // 1. While the bank choice is saving, the bar choice is locked, so the two can never race.
  gate = deferred();
  await act(async () => { bank().props.onChange({ target: { checked: true } }); });
  await flush();
  assert.equal(bar().props.disabled, true, 'bar locked while bank saves');
  assert.equal(bank().props.disabled, true, 'bank busy while saving');
  gate.resolve(); gate = null; await flush();
  assert.equal(server.bank, true);
  const readsAfterBank = requests.filter(r => r.body.action === 'read').length;
  assert.equal(bank().props.checked, true); assert.equal(bar().props.checked, false);
  assert.equal(bar().props.disabled, false, 'bar unlocked once the bank save finishes');

  // 2. While the bar choice is saving, the bank choice is locked.
  gate = deferred();
  await act(async () => { bar().props.onChange({ target: { checked: true } }); });
  await flush();
  assert.equal(bank().props.disabled, true, 'bank locked while bar saves');
  gate.resolve(); gate = null; await flush();
  assert.ok(requests.filter(r => r.body.action === 'read').length > readsAfterBank, 'both choices re-read after a save');
  assert.deepEqual(server, { bar: true, bank: false });
  assert.equal(bar().props.checked, true, 'page shows the stored bar choice');
  assert.equal(bank(), undefined, 'bank choice hidden once the bar is chosen');
  assert.equal(bar().props.disabled, false, 'hiding the bank control mid-read never leaves the bar control locked');

  // 3. Un-ticking the bar brings the bank choice back, reflecting the stored (cleared) bank choice.
  await act(async () => { bar().props.onChange({ target: { checked: false } }); });
  await flush();
  assert.deepEqual(server, { bar: false, bank: false });
  assert.equal(bar().props.checked, false); assert.equal(bank().props.checked, false);
  assert.equal(bank().props.disabled, false);
  await act(async () => tree.unmount());

  // 4. Non-kitchen orders keep the plain bank choice with no bar option or coordination.
  const plain = await (async () => { let t; await act(async () => { t = create(React.createElement(Panel, { ...props, mealDraftToken: undefined })); }); await flush(); return t; })();
  assert.equal(byLabel(plain, 'I will pay cash at the bar'), undefined);
  assert.ok(byLabel(plain, 'I am paying by bank transfer'));
  await act(async () => plain.unmount());
  console.log('PASS: kitchen payment choices lock each other while saving, re-read after saves, match the server, and never stay locked.');
})().catch(error => { console.error(error); process.exit(1); });
