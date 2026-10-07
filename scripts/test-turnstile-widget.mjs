#!/usr/bin/env node
// Offline tests for the Cloudflare Turnstile widget on the public forms.
//   1. Source checks: every public form that posts to a Turnstile-checked
//      route renders the widget, sends `turnstileToken` only to that route,
//      blocks an unchecked submit and resets the single-use token after each
//      attempt. No other client code posts to those routes.
//   2. TurnstileWidget renders nothing without NEXT_PUBLIC_TURNSTILE_SITE_KEY;
//      with a key it loads the Cloudflare script, renders with the site key,
//      reports the token and resets on a new resetKey.
//   3. ContactForm behaviour: without a key the POST body is unchanged (no
//      turnstileToken); with a key and no token the submit is blocked with an
//      inline message; with a token the body carries it and the widget resets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); } catch (error) { failures += 1; console.error(`FAIL ${name}\n${error.stack}`); }
}

// ---------------------------------------------------------------------------
// 1. Source checks
// ---------------------------------------------------------------------------
const FORMS = [
  { file: 'app/contact/ContactForm.tsx', call: "fetch('/api/contacts'" },
  { file: 'app/sponsors/SponsorEnquiryForm.tsx', call: "fetch('/api/contacts'" },
  { file: 'app/volunteer/VolunteerForm.tsx', call: "fetch('/api/volunteers'" },
  { file: 'app/events/[id]/EventDetailClient.tsx', call: "fetch('/api/events'" },
  // The snail order body is built (and size-checked) just before the fetch.
  { file: 'components/events/SnailPurchaseForm.tsx', call: "fetch('/api/events'", bodyBuiltFirst: true },
  { file: 'app/join/SocialMembershipForm.tsx', call: "fetch('/api/memberships'", bodyBuiltFirst: true },
  { file: 'components/donations/DonationForm.tsx', call: "fetch('/api/donations'" },
  { file: 'app/merchandise/MerchandiseClient.tsx', call: 'fetch(endpoint', route: "const endpoint = '/api/orders'" },
  { file: 'app/raffle/RaffleClient.tsx', call: "fetch('/api/raffle/checkout'" },
  { file: 'app/reverse-raffle/ReverseRaffleClient.tsx', call: 'fetch(`/api/raffle/checkout?campaign=' },
  { file: 'app/prize-wheel/PrizeWheelClient.tsx', call: 'fetch(`/api/raffle/checkout?campaign=' },
];

await test('every public form posting to a Turnstile-checked route wires the widget', () => {
  for (const { file, call, route, bodyBuiltFirst } of FORMS) {
    const source = read(file);
    assert.match(source, /import TurnstileWidget, \{ useTurnstile \} from '@\/components\/common\/TurnstileWidget';/, `${file}: imports`);
    assert.match(source, /const turnstile = useTurnstile\(\);/, `${file}: uses the hook`);
    assert.match(source, /<TurnstileWidget onToken=\{turnstile\.setToken\} resetKey=\{turnstile\.resetKey\} action="[a-z-]+" message=\{turnstile\.message\}/, `${file}: renders the widget`);
    if (route) assert.ok(source.includes(route), `${file}: ${route}`);

    const callAt = source.indexOf(call);
    assert.ok(callAt > 0, `${file}: posts with ${call}`);
    const tokens = [...source.matchAll(/turnstileToken: turnstile\.token \?\? undefined/g)];
    assert.equal(tokens.length, 1, `${file}: the token is sent in exactly one request`);
    const tokenAt = tokens[0].index;
    if (bodyBuiltFirst) {
      const between = source.slice(tokenAt, callAt);
      assert.ok(tokenAt < callAt && !between.includes('fetch('), `${file}: the token is in the body built for ${call}`);
    } else {
      const nextFetch = source.indexOf('fetch(', callAt + 1);
      assert.ok(tokenAt > callAt && (nextFetch === -1 || tokenAt < nextFetch), `${file}: the token is sent to ${call} only`);
    }

    const checkAt = source.indexOf('turnstile.check()');
    assert.ok(checkAt > 0 && checkAt < callAt, `${file}: an unchecked submit is blocked before posting`);
    assert.ok(source.includes('turnstile.reset()'), `${file}: resets the single-use token after each attempt`);
    assert.ok(!/disabled=\{[^}]*turnstile/.test(source), `${file}: existing disabled logic is unchanged`);
  }
});

await test('merchandise retries keep the idempotency key but send a fresh token', () => {
  const source = read('app/merchandise/MerchandiseClient.tsx');
  const signatureAt = source.indexOf('const signature = JSON.stringify(orderPayload);');
  const payload = source.slice(source.indexOf('const orderPayload = {'), signatureAt);
  assert.ok(!payload.includes('turnstile'), 'the token is not part of the order signature');
  assert.match(source, /idempotency_key: idempotencyKey \} : orderPayload\),\n\s*turnstileToken: turnstile\.token \?\? undefined,\n\s*\}\),\n\s*\}\)\.finally\(\(\) => turnstile\.reset\(\)\);/);
  assert.match(read('app/merchandise/components/CheckoutForm.tsx'), /\{securityCheck\}\n\n\s*<Button\n\s*type="submit"/);
});

await test('multi-step donation only bot-checks the /api/donations request', () => {
  const source = read('components/donations/DonationForm.tsx');
  assert.match(source, /if \(!orderId && !turnstile\.check\(\)\) return;/);
  const checkout = source.slice(source.indexOf("fetch('/api/payments/checkout-session'"));
  assert.ok(!checkout.slice(0, 300).includes('turnstile'), 'checkout-session gets no token');
});

await test('no other client code posts to a Turnstile-checked route', () => {
  const routes = /['"`]\/api\/(contacts|volunteers|events|memberships|donations|orders|raffle\/checkout)(['"`?/])/;
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (rel !== path.join('app', 'api')) walk(rel); continue; }
      if (/\.(tsx?|jsx?)$/.test(entry.name) && routes.test(fs.readFileSync(path.join(root, rel), 'utf8'))) found.push(rel.split(path.sep).join('/'));
    }
  };
  ['app', 'components', 'lib'].forEach(walk);
  assert.deepEqual(found.sort(), FORMS.map((form) => form.file).sort());
});

await test('server and env docs describe the switch-on order', () => {
  assert.ok(!read('lib/server/turnstile.ts').includes('do not render the widget yet'));
  assert.match(read('lib/server/turnstile.ts'), /TURNSTILE_ENFORCE=true/);
  assert.match(read('.env.example'), /To enable: set NEXT_PUBLIC_TURNSTILE_SITE_KEY and\n# TURNSTILE_SECRET_KEY/);
});

// ---------------------------------------------------------------------------
// Harness: transpile TSX into a vm with fake window/document/process.
// ---------------------------------------------------------------------------
function makeEnv() {
  const env = { process: { env: { NODE_ENV: 'test' } }, fetchCalls: [], appended: [], turnstileCalls: [], renderOptions: null };
  const fakeTurnstile = {
    render: (element, options) => { env.turnstileCalls.push(['render', options.sitekey]); env.renderOptions = options; return 'widget-1'; },
    reset: (id) => env.turnstileCalls.push(['reset', id]),
    remove: (id) => env.turnstileCalls.push(['remove', id]),
  };
  env.window = {};
  env.document = {
    createElement: (tag) => ({ tag }),
    head: { appendChild: (node) => { env.appended.push(node); setTimeout(() => { env.window.turnstile = fakeTurnstile; node.onload(); }, 0); } },
  };
  env.fetch = async (url, options = {}) => {
    env.fetchCalls.push({ url, body: options.body });
    return { ok: true, json: async () => ({ success: true, emailStatus: 'sent', message: 'Thanks.' }) };
  };
  const cache = new Map();
  env.load = function load(file) {
    const resolved = ['', '.tsx', '.ts'].map((ext) => file + ext).find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!resolved) throw new Error(`Cannot resolve ${file}`);
    if (cache.has(resolved)) return cache.get(resolved);
    const exports = {}; cache.set(resolved, exports);
    const code = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, {
      exports, module: { exports }, console, setTimeout, clearTimeout, Date, Promise,
      process: env.process, window: env.window, document: env.document, fetch: env.fetch,
      require(name) {
        if (name.startsWith('@/')) return load(path.join(root, name.slice(2)));
        if (name.startsWith('.')) return load(path.resolve(path.dirname(resolved), name));
        return require(name);
      },
    }, { filename: resolved });
    return exports;
  };
  return env;
}
const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const nodeMock = () => ({ nodeName: 'DIV' });
const text = (node) => (typeof node === 'string' ? node : (node.children || []).map(text).join(''));
const SITE_KEY = '1x00000000000000000000AA';

// ---------------------------------------------------------------------------
// 2. TurnstileWidget render test
// ---------------------------------------------------------------------------
await test('TurnstileWidget renders nothing and loads no script without a site key', async () => {
  const env = makeEnv();
  const { default: TurnstileWidget, useTurnstile } = env.load(path.join(root, 'components/common/TurnstileWidget'));
  let hook;
  function Probe() { hook = useTurnstile(); return React.createElement(TurnstileWidget, { onToken: hook.setToken, resetKey: hook.resetKey }); }
  let tree;
  await act(async () => { tree = create(React.createElement(Probe), { createNodeMock: nodeMock }); });
  await flush();
  assert.equal(tree.toJSON(), null);
  assert.equal(env.appended.length, 0, 'no Cloudflare script is requested');
  assert.equal(hook.required, false);
  assert.equal(hook.ready, true);
  let allowed;
  await act(async () => { allowed = hook.check(); });
  assert.equal(allowed, true, 'forms submit as before');
  assert.equal(hook.message, '');
  await act(async () => tree.unmount());
});

await test('TurnstileWidget loads the script, renders with the site key, reports the token and resets', async () => {
  const env = makeEnv();
  env.process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = SITE_KEY;
  const { default: TurnstileWidget, useTurnstile, TURNSTILE_MISSING_MESSAGE } = env.load(path.join(root, 'components/common/TurnstileWidget'));
  let hook;
  function Probe() { hook = useTurnstile(); return React.createElement(TurnstileWidget, { onToken: hook.setToken, resetKey: hook.resetKey, action: 'contact', message: hook.message }); }
  let tree;
  await act(async () => { tree = create(React.createElement(Probe), { createNodeMock: nodeMock }); });
  await flush();
  assert.equal(env.appended.length, 1);
  assert.equal(env.appended[0].tag, 'script');
  assert.equal(env.appended[0].src, 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
  assert.deepEqual(env.turnstileCalls, [['render', SITE_KEY]]);
  assert.equal(env.renderOptions.action, 'contact');
  assert.equal(hook.required, true);
  assert.equal(hook.ready, false);

  let allowed;
  await act(async () => { allowed = hook.check(); });
  assert.equal(allowed, false, 'blocked until the check is done');
  assert.equal(hook.message, TURNSTILE_MISSING_MESSAGE);
  assert.ok(tree.root.findAll((node) => node.type === 'p' && node.props.role === 'alert').some((node) => text(node) === 'Please complete the security check above.'));

  await act(async () => { env.renderOptions.callback('token-abc'); });
  assert.equal(hook.token, 'token-abc');
  assert.equal(hook.ready, true);
  assert.equal(hook.message, '', 'completing the check clears the message');

  await act(async () => { hook.reset(); });
  assert.equal(hook.token, null);
  assert.deepEqual(env.turnstileCalls.at(-1), ['reset', 'widget-1']);

  await act(async () => { env.renderOptions['expired-callback'](); });
  assert.equal(hook.token, null);
  await act(async () => tree.unmount());
  assert.deepEqual(env.turnstileCalls.at(-1), ['remove', 'widget-1']);
});

// ---------------------------------------------------------------------------
// 3. ContactForm behaviour
// ---------------------------------------------------------------------------
async function renderContact(siteKey) {
  const env = makeEnv();
  if (siteKey) env.process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = siteKey;
  const { default: ContactForm } = env.load(path.join(root, 'app/contact/ContactForm'));
  let tree;
  await act(async () => { tree = create(React.createElement(ContactForm, { urgentEmail: 'test@example.invalid' }), { createNodeMock: nodeMock }); });
  await flush();
  const submit = async () => {
    await act(async () => { await tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
    await flush();
  };
  return { env, tree, submit };
}

await test('ContactForm without a site key posts exactly the old body', async () => {
  const { env, tree, submit } = await renderContact('');
  assert.equal(env.appended.length, 0);
  assert.ok(!JSON.stringify(tree.toJSON()).includes('security check'));
  await submit();
  assert.equal(env.fetchCalls.length, 1);
  assert.equal(env.fetchCalls[0].url, '/api/contacts');
  const body = JSON.parse(env.fetchCalls[0].body);
  assert.deepEqual(Object.keys(body), ['name', 'email', 'enquiry_type', 'message', 'hp_field', 'submitted_at']);
  assert.ok(!env.fetchCalls[0].body.includes('turnstile'));
  assert.equal(env.turnstileCalls.length, 0);
  await act(async () => tree.unmount());
});

await test('ContactForm with a site key blocks an unchecked submit, then sends the token and resets', async () => {
  const { env, tree, submit } = await renderContact(SITE_KEY);
  await submit();
  assert.equal(env.fetchCalls.length, 0, 'nothing is sent before the check');
  assert.ok(tree.root.findAll((node) => node.type === 'p' && node.props.role === 'alert').some((node) => text(node) === 'Please complete the security check above.'));

  await act(async () => { env.renderOptions.callback('token-xyz'); });
  await submit();
  assert.equal(env.fetchCalls.length, 1);
  assert.equal(JSON.parse(env.fetchCalls[0].body).turnstileToken, 'token-xyz');
  assert.deepEqual(env.turnstileCalls.at(-1), ['reset', 'widget-1'], 'the single-use token is reset after the attempt');

  // The used token is gone: a second submit is blocked until a new check.
  await submit();
  assert.equal(env.fetchCalls.length, 1);
  await act(async () => { env.renderOptions.callback('token-2'); });
  await submit();
  assert.equal(JSON.parse(env.fetchCalls[1].body).turnstileToken, 'token-2');
  await act(async () => tree.unmount());
});

if (failures) {
  console.error(`\n${failures} Turnstile widget test(s) failed`);
  process.exit(1);
}
console.log('\nAll Turnstile widget tests passed');
