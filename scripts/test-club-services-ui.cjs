const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, dependencies, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console, Error, URL, URLSearchParams, ...globals, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports.default;
}
const common = {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': { default: props => React.createElement('a', props) },
  '@/components/ui/Button': { default: props => React.createElement('button', props) },
  '@/components/ui/Input': { default: props => React.createElement('input', props) },
};
const button = (tree, text) => tree.root.findAllByType('button').find(node => node.children.includes(text));
const text = tree => JSON.stringify(tree.toJSON());
const change = (tree, id, value) => act(async () => tree.root.findByProps({ id }).props.onChange({ target: { value } }));

(async () => {
  // Execute the real component with isolated auth/API adapters, never live credentials.
  let session = null, accountProfile = null, profileFails = false, saved;
  const authCalls = [];
  const auth = {
    getSession: async () => ({ data: { session } }),
    signInWithPassword: async input => { authCalls.push(input); session = { user: { email: input.email } }; return { data: { session } }; },
    signUp: async input => { authCalls.push(input); return { data: { session: null } }; },
    signOut: async () => { session = null; return {}; },
    resetPasswordForEmail: async () => ({}),
  };
  const Account = load('app/club-account/ClubAccount.tsx', { ...common,
    '@/lib/fantasy-browser': {
      isFantasySupabaseConfigured: true, getFantasyBrowserClient: () => ({ auth }),
      fantasyJsonFetch: async (_url, options) => {
        if (profileFails) throw new Error('Profile unavailable');
        if (options?.method === 'POST') { saved = JSON.parse(options.body); accountProfile = { ...saved, membership_status: 'pending' }; }
        return { profile: accountProfile, email: session.user.email };
      },
    },
  }, { window: { location: { origin: 'https://example.invalid', search: '' } } });
  let account;
  await act(async () => { account = create(React.createElement(Account)); });
  await act(async () => button(account, 'Create an account').props.onClick());
  await change(account, 'club-email', 'member@example.invalid');
  await change(account, 'club-password', 'isolated-test-password');
  await act(async () => account.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.match(text(account), /Check your email to confirm/);
  assert.equal(authCalls[0].options.emailRedirectTo, 'https://example.invalid/club-account');
  assert.equal(account.root.findByProps({ id: 'club-password' }).props.value, '');
  await act(async () => button(account, 'Already have an account?').props.onClick());
  profileFails = true;
  await act(async () => account.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.match(text(account), /Profile unavailable/);
  assert.equal(button(account, 'Save my details').props.disabled, true);
  profileFails = false;
  await act(async () => button(account, 'Retry loading account').props.onClick());
  await change(account, 'club-name', 'Test Member');
  await act(async () => account.root.findByProps({ type: 'checkbox' }).props.onChange({ target: { checked: true } }));
  assert.equal(button(account, 'Save my details').props.disabled, false);
  await act(async () => account.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(saved.full_name, 'Test Member'); assert.equal(saved.privacyAccepted, true);
  assert.match(text(account), /Your details are saved/);
  await act(async () => button(account, 'Sign out').props.onClick());
  accountProfile = null;
  await change(account, 'club-email', 'second@example.invalid');
  await act(async () => account.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(account.root.findByProps({ id: 'club-name' }).props.value, '', 'A different account must not inherit the previous profile');
  assert.equal(account.root.findByProps({ type: 'checkbox' }).props.checked, false);
  await act(async () => account.unmount());

  const firstKey = '00000000-0000-4000-8000-000000000001';
  let location = { href: `https://example.invalid/admin/raffle/cash?sale=${firstKey}` };
  const windowStub = { location, history: { replaceState(_state, _title, url) { location.href = String(url); } } };
  let sale = null, failPost = true, postBodies = [], reads = 0;
  const Cash = load('app/admin/raffle/cash/page.tsx', common, {
    window: windowStub, crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000002' },
    fetch: async (_url, options) => {
      if (options?.method === 'POST') {
        postBodies.push(JSON.parse(options.body));
        if (failPost) throw new Error('Connection interrupted');
        sale = { ticketReferences: ['NDCCTRO-20260001'], amountCents: 500, paymentReference: 'test-reference', deliveryStatus: 'queued' };
        return { ok: true, json: async () => sale };
      }
      reads++;
      return { ok: true, json: async () => ({ campaign: { name: 'Trailer', active: true, draw_at: '2099-01-01', price_cents: 500 }, sale }) };
    },
  });
  let cash;
  await act(async () => { cash = create(React.createElement(Cash)); });
  await change(cash, 'cash-name', 'Test Buyer');
  await change(cash, 'cash-email', 'buyer@example.invalid');
  assert.equal(button(cash, 'Accept cash and issue tickets').props.disabled, true);
  await act(async () => cash.root.findByProps({ type: 'checkbox' }).props.onChange({ target: { checked: true } }));
  await act(async () => cash.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(cash.root.findByType('fieldset').props.disabled, true);
  assert.ok(button(cash, 'Retry this same sale'));
  failPost = false;
  await act(async () => cash.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.deepEqual(postBodies[0], postBodies[1]); assert.equal(postBodies[1].saleKey, firstKey);
  assert.match(text(cash), /Cash sale recorded/);
  sale = { ...sale, deliveryStatus: 'delivered' };
  await act(async () => button(cash, 'Refresh email status').props.onClick());
  assert.match(text(cash), /provider accepted/); assert.equal(postBodies.length, 2, 'Refresh must not resubmit or resend');
  await act(async () => cash.unmount());
  await act(async () => { cash = create(React.createElement(Cash)); });
  assert.match(text(cash), /provider accepted/, 'Reload recovers the saved result');
  for (const status of ['dead_letter', 'cancelled', 'unknown']) {
    sale = { ...sale, deliveryStatus: status };
    await act(async () => button(cash, 'Refresh email status').props.onClick());
    assert.doesNotMatch(text(cash), /queued for email delivery/);
    assert.match(text(cash), /email diagnostics/);
  }
  assert.ok(reads >= 5);
  await act(async () => button(cash, 'Start next sale').props.onClick());
  assert.equal(cash.root.findByProps({ id: 'cash-name' }).props.value, '');
  assert.notEqual(new URL(location.href).searchParams.get('sale'), firstKey);
  assert.equal(button(cash, 'Accept cash and issue tickets').props.disabled, true);
  await act(async () => cash.unmount());
  console.log('PASS club account signup/login, load recovery, privacy/save, account isolation; cash confirmation, stable retries, reload, delivery refresh and next-sale reset');
})().catch(error => { console.error(error); process.exitCode = 1; });
