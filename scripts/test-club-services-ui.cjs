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
const submitAccount = (tree, fields = {}) => act(async () => tree.root.findByType('form').props.onSubmit({
  preventDefault() {}, currentTarget: { elements: { namedItem(name) {
    return { value: fields[name] ?? tree.root.findByProps({ id: `club-${name}` }).props.value };
  } } },
}));

(async () => {
  // Execute the real component with isolated auth/API adapters, never live credentials.
  let session = null, accountProfile = null, profileFails = false, authFails = false, saved, resetEmail, resetOptions;
  const authCalls = [];
  const auth = {
    getSession: async () => ({ data: { session } }),
    signInWithPassword: async input => { authCalls.push(input); if(authFails)return {error:new Error('Invalid login credentials')}; session = { user: { email: input.email } }; return { data: { session } }; },
    signUp: async input => { authCalls.push(input); return { data: { session: null } }; },
    signOut: async () => { session = null; return {}; },
    resetPasswordForEmail: async (email, options) => { resetEmail=email; resetOptions=options; return {}; },
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
  await submitAccount(account,{email:' SIGNUP@EXAMPLE.INVALID ',password:'autofilled-signup-password'});
  assert.match(text(account), /Check your email to confirm/);
  assert.equal(authCalls[0].options.emailRedirectTo, 'https://example.invalid/club-account');
  assert.equal(authCalls[0].email, 'signup@example.invalid');
  assert.equal(authCalls[0].password, 'autofilled-signup-password');
  assert.equal(account.root.findByProps({ id: 'club-password' }).props.value, '');
  await act(async () => button(account, 'Already have an account?').props.onClick());
  profileFails = true;
  // Password managers can populate the form without updating React state.
  // Submit must use the visible controls, including meaningful password spaces.
  await submitAccount(account, { email: ' AUTOFILLED@EXAMPLE.INVALID ', password: '  filled-password  ' });
  assert.equal(authCalls[1].email, 'autofilled@example.invalid');
  assert.equal(authCalls[1].password, '  filled-password  ');
  assert.match(text(account), /Profile unavailable/);
  assert.equal(button(account, 'Save my details').props.disabled, true);
  profileFails = false;
  await act(async () => button(account, 'Retry loading account').props.onClick());
  await change(account, 'club-name', 'Test Member');
  await act(async () => account.root.findByProps({ type: 'checkbox' }).props.onChange({ target: { checked: true } }));
  assert.equal(button(account, 'Save my details').props.disabled, false);
  await submitAccount(account);
  assert.equal(saved.full_name, 'Test Member'); assert.equal(saved.privacyAccepted, true);
  assert.match(text(account), /Your details are saved/);
  await act(async () => button(account, 'Sign out').props.onClick());
  accountProfile = null;
  await change(account, 'club-email', 'second@example.invalid');
  await submitAccount(account);
  assert.equal(account.root.findByProps({ id: 'club-name' }).props.value, '', 'A different account must not inherit the previous profile');
  assert.equal(account.root.findByProps({ type: 'checkbox' }).props.checked, false);
  await act(async () => button(account, 'Sign out').props.onClick());
  authFails=true;
  await submitAccount(account,{email:'correct@example.invalid',password:'current-password'});
  assert.match(text(account),/Invalid login credentials/);
  assert.equal(button(account,'Retry loading account'),undefined,'A rejected password must not offer a profile-loading retry');
  assert.equal(button(account,'Sign in').props.isLoading,false,'A rejected request releases the busy state');
  assert.equal(account.root.findByProps({id:'club-password'}).props.value,'current-password');
  await change(account,'club-email','');
  assert.equal(button(account,'Reset password').props.disabled,false,'Autofilled email can be present when React state is empty');
  await act(async()=>button(account,'Reset password').props.onClick({currentTarget:{form:{elements:{namedItem:()=>({value:' RESET@EXAMPLE.INVALID ',reportValidity:()=>true})}}}}));
  assert.equal(resetEmail,'reset@example.invalid');
  assert.equal(resetOptions.redirectTo,'https://example.invalid/club-account/reset-password');
  assert.match(text(account),/password reset email has been sent/);
  await act(async () => account.unmount());

  let recoverySession = null, updatedPassword, cleanedPath;
  const Reset = load('components/auth/ResetPasswordForm.tsx', { ...common,
    '@/components/ui/Card': { default: props => React.createElement('div', props), CardContent: props => React.createElement('div', props) },
    '@/lib/fantasy-browser': { isFantasySupabaseConfigured: true, getFantasyBrowserClient: () => ({ auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: recoverySession } }),
      exchangeCodeForSession: async () => ({ error: null }),
      updateUser: async ({ password }) => { updatedPassword = password; return { error: null }; },
    } }) },
  }, { window: { location: { search: '?code=isolated-test-code' }, history: { replaceState(_state, _title, path) { cleanedPath = path; } } } });
  let reset;
  await act(async () => { reset = create(React.createElement(Reset, { context: 'club' })); });
  assert.equal(cleanedPath, '/club-account/reset-password');
  assert.deepEqual(reset.root.findAllByType('a').map(node => node.props.href), ['/club-account']);
  assert.doesNotMatch(text(reset), /Dino Coach|fantasy/);
  await act(async () => reset.unmount());
  recoverySession = { user: { id: 'isolated-member' } };
  await act(async () => { reset = create(React.createElement(Reset, { context: 'club' })); });
  await change(reset, 'newPassword', 'isolated-new-password');
  await change(reset, 'confirmPassword', 'different-password');
  await act(async () => button(reset, 'Set new password').props.onClick());
  assert.equal(updatedPassword, undefined);
  assert.match(text(reset), /do not match/);
  await change(reset, 'confirmPassword', 'isolated-new-password');
  await act(async () => button(reset, 'Set new password').props.onClick());
  assert.equal(updatedPassword, 'isolated-new-password');
  assert.match(text(reset), /Your password has been updated/);
  assert.deepEqual(reset.root.findAllByType('a').map(node => node.props.href), ['/club-account']);
  assert.doesNotMatch(text(reset), /Dino Coach|fantasy/);
  await act(async () => reset.unmount());
  await act(async () => { reset = create(React.createElement(Reset)); });
  assert.equal(cleanedPath, '/fantasy/reset-password');
  await change(reset, 'newPassword', 'isolated-new-password');
  await change(reset, 'confirmPassword', 'isolated-new-password');
  await act(async () => button(reset, 'Set new password').props.onClick());
  assert.deepEqual(reset.root.findAllByType('a').map(node => node.props.href), ['/fantasy/account']);
  await act(async () => reset.unmount());

  const firstKey = '00000000-0000-4000-8000-000000000001';
  let location = { href: `https://example.invalid/admin/raffle/cash?sale=${firstKey}` };
  const windowStub = { location, history: { replaceState(_state, _title, url) { location.href = String(url); } } };
  let sale = null, failPost = true, postBodies = [], reads = 0;
  const Cash = load('components/raffle/CashSaleForm.tsx', { ...common, '@/lib/fantasy-browser': { fantasyAuthHeaders: async () => ({ Authorization: 'Bearer test-member' }) } }, {
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
  await act(async () => { cash = create(React.createElement(Cash, { member: true })); });
  assert.match(text(cash), /Each sale is recorded against your account/);
  assert.ok(cash.root.findAllByProps({ href: '/raffle' }).length);
  await act(async () => cash.unmount());
  console.log('PASS club account signup/login, load recovery, privacy/save, account isolation; cash confirmation, stable retries, reload, delivery refresh and next-sale reset');
})().catch(error => { console.error(error); process.exitCode = 1; });
