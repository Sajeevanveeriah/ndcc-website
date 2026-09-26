const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');

function load(path, dependencies, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console, ...globals, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const raffleConstants = load('lib/raffle-constants.ts', {});
const selection = load('lib/reverse-raffle-selection.ts', { '@/lib/raffle-constants': raffleConstants });
let unavailable = [202], availabilityFails = false, checkoutBody;
const windowStub = { setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {}, location: {} };
const component = load('app/reverse-raffle/ReverseRaffleClient.tsx', {
  '@/components/payments/PaymentMethodChoice': { default: () => null },
  '@/components/payments/BankTransferInstructions': { default: () => null },
  react: React,
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/navigation': { useSearchParams: () => new URLSearchParams() },
  'next/image': { default: props => React.createElement('img', props) },
  '@/components/ui/Button': { default: ({ isLoading, ...props }) => React.createElement('button', { ...props, disabled: props.disabled || isLoading }) },
  '@/components/ui/Input': { default: props => React.createElement('input', props) },
  '@/lib/reverse-raffle-selection': selection,
  '@/lib/raffle-constants': raffleConstants,
}, {
  window: windowStub,
  fetch: async (url, options) => {
    if (url.startsWith('/api/raffle/checkout')) {
      checkoutBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ checkout_url: 'https://checkout.stripe.com/test' }) };
    }
    return { ok: !availabilityFails, json: async () => ({ unavailable }) };
  },
}).default;

(async () => {
  let tree;
  await act(async () => { tree = create(React.createElement(component, { priceCents: 6000, drawLabel: null })); });
  const number = n => tree.root.findAllByType('button').find(b => b.props['aria-label']?.startsWith(`Number ${n}`));
  const pay = () => tree.root.findAllByType('button').find(b => b.props.type === 'submit');
  const quantity = () => tree.root.findByProps({ id: 'reverse-raffle-quantity' });
  const refresh = async () => act(async () => { await tree.root.findAllByType('button').find(b => b.children.includes('Refresh availability')).props.onClick(); });
  assert.equal(tree.root.findAllByType('button').filter(b => b.props['aria-label']?.startsWith('Number ')).length, 100);
  assert.ok(number(202).props.disabled);
  assert.ok(pay().props.disabled);
  await act(async () => quantity().props.onChange({ target: { value: '3' } }));
  for (const n of [201, 250, 300]) await act(async () => number(n).props.onClick());
  assert.equal(pay().props.disabled, false);
  assert.ok(number(203).props.disabled, 'Cannot choose beyond quantity');
  assert.equal(number(300).props['aria-pressed'], true);
  await act(async () => quantity().props.onChange({ target: { value: '2' } }));
  assert.equal(number(300).props['aria-pressed'], false, 'Reducing quantity removes excess selection');
  unavailable = [202, 250];
  await refresh();
  assert.ok(pay().props.disabled, 'Newly unavailable selection blocks payment');
  assert.equal(number(250).props.disabled, false, 'A stale choice remains removable');
  await act(async () => number(250).props.onClick());
  await act(async () => number(300).props.onClick());
  availabilityFails = true;
  await refresh();
  assert.ok(pay().props.disabled, 'Failed availability fails closed');
  availabilityFails = false;
  await refresh();
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.deepEqual(checkoutBody.selectedNumbers, [201, 300]);
  assert.equal(checkoutBody.quantity, 2);
  assert.equal(windowStub.location.href, 'https://checkout.stripe.com/test');
  await act(async () => tree.unmount());
  console.log('Reverse raffle UI: grid, held numbers, quantity changes, stale selections, availability failures and exact checkout payload passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
