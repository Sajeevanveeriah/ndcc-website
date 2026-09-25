const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, console, Error, Date, Set, Object, Number, Array, URL, URLSearchParams, Response, Request, Intl, setTimeout, clearTimeout, ...globals, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name];
  } });
  return exports;
}
const normal = value => JSON.parse(JSON.stringify(value));
const preferenceLib = load('lib/club-account/preferences.ts');
const purchaseLib = load('lib/club-account/purchases.ts');
const csv = load('lib/csv.ts');
const next = { NextResponse: { json: (body, options) => Response.json(body, options) } };
const common = {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': { default: props => React.createElement('a', props) },
  '@/components/ui/Button': { default: props => React.createElement('button', props) },
};
const content = tree => JSON.stringify(tree.toJSON());
const button = (tree, label) => tree.root.findAllByType('button').find(node => node.children.includes(label));
const req = (body, search = '') => new Request(`https://example.invalid/api/club-account/preferences${search}`, { method: body ? 'PUT' : 'GET', ...(body ? { body: JSON.stringify(body) } : {}) });
(async () => {
  let abortAccountRead = false;
  const browserRequests = load('lib/fantasy-browser.ts', { '@supabase/supabase-js': {} }, {
    process: { env: {} }, Headers, AbortController, DOMException,
    fetch: async () => { if (abortAccountRead) throw new DOMException('Aborted', 'AbortError'); return Response.json(null); },
  });
  const accountRequests = load('lib/club-account/browser.ts', { '@/lib/fantasy-browser': browserRequests });
  await assert.rejects(accountRequests.clubAccountJsonFetch('/api/club-account'), /club account service returned an unreadable response/);
  abortAccountRead = true;
  await assert.rejects(accountRequests.clubAccountJsonFetch('/api/club-account'), /club account service is taking too long/);
  await assert.rejects(browserRequests.fantasyJsonFetch('/api/fantasy'), /fantasy service is taking too long/);
  assert.equal(preferenceLib.parsePreferences({ interests: ['admin'], volunteering: [], email_updates: true }), null);
  assert.equal(preferenceLib.parsePreferences({ interests: [], volunteering: [], email_updates: 'true' }), null);
  const input = { interests: ['club_news', 'club_news'], volunteering: ['events'], email_updates: true, member_id: 'victim' };
  assert.deepEqual(normal(preferenceLib.parsePreferences(input)), { interests: ['club_news'], volunteering: ['events'], email_updates: true });
  assert.equal(purchaseLib.exactEmailPattern(' M_%@example.invalid '), 'M\\_\\%@example.invalid');
  const row = { id: 'o1', customer_email: 'hidden', notes: 'private staff note', payment_reference: 'REF1', order_category: 'merch', total_amount: '80', amount_paid: '20', balance_due: '60', payment_status: 'part_paid', order_status: 'submitted', items: [{ name: 'Club shirt', quantity: 1, custom_name: 'Private' }] };
  assert.equal(purchaseLib.memberPurchase(row).can_pay, true);
  assert.equal(purchaseLib.memberPurchase({ ...row, payment_status: 'pending_bank_transfer' }).can_pay, true);
  for (const patch of [{ order_status: 'cancelled' }, { payment_status: 'refunded' }, { payment_status: 'needs_review' }, { balance_due: null }, { balance_due: 0 }]) assert.equal(purchaseLib.memberPurchase({ ...row, ...patch }).can_pay, false);
  assert.equal(purchaseLib.memberPurchase({ ...row, total_amount: null }).total, null);
  assert.equal(purchaseLib.memberPurchase(row).notes, undefined);
  assert.equal(purchaseLib.memberPurchase(row).customer_email, undefined);
  assert.equal(purchaseLib.memberPurchase(row).items[0].custom_name, undefined);
  assert.equal(purchaseLib.memberPurchase({ ...row, status: 'pending', raffle_tickets: [{ ticket_number: 200 }] }, true).tickets.length, 0);

  let user = null, profile = null, preference = null, fault = false, rate = true, writes = [], queries = [];
  const db = { from(table) {
    const conditions = []; queries.push({ table, conditions }); let writing = false;
    const chain = { select: () => chain, eq: (...args) => { conditions.push(args); return chain; },
      upsert: record => { writing = true; writes.push(record); preference = record; return chain; },
      maybeSingle: async () => ({ data: table === 'club_members' ? profile : preference, error: fault ? new Error('sensitive detail') : null }),
      single: async () => ({ data: writing ? preference : null, error: fault ? new Error('sensitive detail') : null }) };
    return chain;
  } };
  const preferencesRoute = load('app/api/club-account/preferences/route.ts', {
    'next/server': next, '@/lib/fantasy-manager-auth': { getAuthUserFromRequest: async () => user }, '@/lib/supabase-server': { createServerClient: () => db },
    '@/lib/order-input-validation': { readLimitedJsonObject: async request => ({ ok: true, value: await request.json() }) },
    '@/lib/server/request-guards': { enforceRateLimit: async () => rate }, '@/lib/club-account/preferences': preferenceLib,
  });
  assert.equal((await preferencesRoute.GET(req())).status, 401); assert.equal(queries.length, 0);
  user = { id: 'owner', email: 'owner@example.invalid' };
  assert.equal((await preferencesRoute.PUT(req(input))).status, 401);
  user.email_confirmed_at = '2026-09-25';
  assert.equal((await (await preferencesRoute.GET(req())).json()).profile_required, true);
  assert.equal((await preferencesRoute.PUT(req(input))).status, 409);
  profile = { id: 'own-member' };
  let response = await preferencesRoute.PUT(req(input)); assert.equal(response.status, 200);
  assert.equal(writes[0].member_id, 'own-member'); assert.equal(writes[0].auth_user_id, undefined);
  assert.equal(writes[0].interests.length, 1);
  assert.ok(queries.some(query => query.conditions.some(([field, value]) => field === 'auth_user_id' && value === 'owner')));
  response = await preferencesRoute.GET(req()); assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.deepEqual((await response.json()).preferences.interests, ['club_news']);
  rate = false; assert.equal((await preferencesRoute.PUT(req(input))).status, 429); assert.equal(writes.length, 1); rate = true;
  assert.equal((await preferencesRoute.PUT(req({ ...input, interests: ['unknown'] }))).status, 400);
  fault = true; response = await preferencesRoute.GET(req()); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /sensitive detail/); fault = false;
  user.id = 'second-owner'; profile = { id: 'second-member' }; preference = null;
  await preferencesRoute.PUT(req({ interests: [], volunteering: [], email_updates: false, member_id: 'own-member' }));
  assert.equal(writes[1].member_id, 'second-member');

  let calls = [], orderError = false;
  const purchasesRoute = load('app/api/club-account/purchases/route.ts', {
    'next/server': next, '@/lib/fantasy-manager-auth': { getAuthUserFromRequest: async () => user }, '@/lib/club-account/purchases': purchaseLib,
    '@/lib/supabase-server': { createServerClient: () => ({ from(table) { calls.push(['from', table]); const chain = {};
      for (const method of ['select', 'ilike', 'is', 'order']) chain[method] = (...args) => { calls.push([method, ...args]); return chain; };
      chain.range = async (...args) => { calls.push(['range', ...args]); return { data: [row], count: 21, error: orderError ? new Error('private') : null }; }; return chain;
    } }) },
  });
  user.email = 'member_%@example.invalid';
  response = await purchasesRoute.GET(req(undefined, '?page=1&email=victim@example.invalid'));
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.ok(calls.some(call => call[0] === 'ilike' && call[2] === 'member\\_\\%@example.invalid'));
  assert.ok(calls.some(call => call[0] === 'is' && call[1] === 'deleted_at' && call[2] === null));
  assert.ok(calls.some(call => call[0] === 'range' && call[1] === 20 && call[2] === 39));
  assert.doesNotMatch(await response.text(), /private staff note|custom_name|hidden/);
  assert.equal((await purchasesRoute.GET(req(undefined, '?page=0.5'))).status, 400);
  user = null; calls = []; assert.equal((await purchasesRoute.GET(req())).status, 401); assert.equal(calls.length, 0);
  user = { id: 'owner', email: 'owner@example.invalid', email_confirmed_at: 'yes' }; orderError = true;
  assert.equal((await purchasesRoute.GET(req())).status, 503); orderError = false;

  let admin = false, adminCalls = [];
  const adminRoute = load('app/api/admin/memberships/preferences/route.ts', {
    'next/server': next, '@/lib/auth/guard': { requirePermissionResult: async permission => { assert.equal(permission, 'memberships'); return admin ? { user: {} } : { user: null, status: 403, error: 'Forbidden' }; } },
    '@/lib/club-account/preferences': preferenceLib, '@/lib/csv': csv,
    '@/lib/supabase-server': { createServerClient: () => ({ from() {
      const chain = {}; for (const method of ['select', 'not', 'contains', 'eq', 'neq', 'order']) chain[method] = (...args) => { adminCalls.push([method, ...args]); return chain; };
      chain.range = async (start, end) => { adminCalls.push(['range', start, end]); return { data: [{ member_id: 'm' + start, member: { full_name: '=Formula', email: 'owner@example.invalid', phone: '', membership_status: 'active', auth_user_id: 'private-auth-id' }, interests: ['club_news'], volunteering: [], email_updates: true, updated_at: 'today' }], count: 1001, error: null }; }; return chain;
    } }) },
  });
  assert.equal((await adminRoute.GET(req())).status, 403); assert.equal(adminCalls.length, 0); admin = true;
  response = await adminRoute.GET(req(undefined, '?interest=club_news&export=csv'));
  assert.equal(response.status, 200); const exported = await response.text(); assert.match(exported, /'=Formula/); assert.doesNotMatch(exported, /private-auth-id/);
  assert.ok(adminCalls.some(call => call[0] === 'eq' && call[1] === 'email_updates' && call[2] === true));
  assert.ok(adminCalls.some(call => call[0] === 'neq' && call[1] === 'member.membership_status' && call[2] === 'inactive'));
  assert.ok(adminCalls.some(call => call[0] === 'range' && call[1] === 1000));
  assert.equal((await adminRoute.GET(req(undefined, '?interest=forged'))).status, 400);

  let saved = null, preferencesFail = false;
  const Interests = load('components/club-account/MemberInterests.tsx', { ...common, '@/lib/club-account/preferences': preferenceLib,
    '@/lib/club-account/browser': { clubAccountJsonFetch: async (_url, options) => {
      if (preferencesFail) throw new Error('Unavailable');
      if (options) saved = JSON.parse(options.body);
      return { preferences: saved || preferenceLib.emptyPreferences() };
    } },
  }).default;
  let tree;
  await act(async () => { tree = create(React.createElement(Interests, { profileComplete: true, editProfile() {} })); });
  let inputs = tree.root.findAllByType('input'); assert.ok(inputs.every(input => input.props.checked === false));
  await act(async () => inputs[0].props.onChange());
  await act(async () => inputs[inputs.length - 1].props.onChange({ target: { checked: true } }));
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.deepEqual(saved.interests, ['club_news']); assert.equal(saved.email_updates, true); assert.match(content(tree), /are saved/);
  await act(async () => tree.unmount());
  await act(async () => { tree = create(React.createElement(Interests, { profileComplete: true, editProfile() {} })); });
  assert.equal(tree.root.findAllByType('input')[0].props.checked, true);
  await act(async () => tree.unmount()); preferencesFail = true;
  await act(async () => { tree = create(React.createElement(Interests, { profileComplete: true, editProfile() {} })); });
  assert.equal(button(tree, 'Save my interests').props.disabled, true); assert.match(content(tree), /could not be loaded/);
  await act(async () => tree.unmount());

  let redirected = '', paymentCalls = [], checkoutUrl = 'https://evil.invalid/checkout';
  const Purchases = load('components/club-account/MemberPurchases.tsx', { ...common,
    '@/lib/club-account/browser': { clubAccountJsonFetch: async () => ({ purchases: [purchaseLib.memberPurchase(row)], total: 1 }) },
    '@/lib/orders/purchase-groups': load('lib/orders/purchase-groups.ts'),
  }, { window: { location: { assign: value => { redirected = value; } } }, fetch: async (_url, options) => { paymentCalls.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ checkout_url: checkoutUrl }) }; } }).default;
  await act(async () => { tree = create(React.createElement(Purchases, { email: 'owner@example.invalid' })); });
  assert.match(content(tree), /Club shirt/);
  await act(async () => button(tree, 'Pay apparel balance').props.onClick()); assert.equal(redirected, ''); assert.match(content(tree), /temporarily unavailable/);
  assert.deepEqual(paymentCalls[0], { reference: 'REF1', email: 'owner@example.invalid', checkout: true });
  checkoutUrl = 'https://checkout.stripe.com/c/pay/test'; await act(async () => button(tree, 'Pay apparel balance').props.onClick()); assert.equal(redirected, checkoutUrl);
  await act(async () => tree.unmount());

  let copiedLink = '', sharedLink = null;
  const shareNavigator = { clipboard: { writeText: async value => { copiedLink = value; } } };
  const Share = load('components/club-account/ShareLink.tsx', common, {
    navigator: shareNavigator, window: { location: { origin: 'https://club.example.invalid' } },
  }).default;
  await act(async () => { tree = create(React.createElement(Share, { path: '/news/published', title: 'Club update' })); });
  await act(async () => tree.root.findByType('button').props.onClick());
  assert.equal(copiedLink, 'https://club.example.invalid/news/published'); assert.match(content(tree), /Link copied/);
  shareNavigator.clipboard.writeText = async () => { throw new Error('Clipboard denied'); };
  await act(async () => tree.root.findByType('button').props.onClick());
  assert.equal(tree.root.findByType('input').props.value, copiedLink); assert.doesNotMatch(content(tree), /Link copied/);
  shareNavigator.share = async data => { sharedLink = data; };
  await act(async () => tree.root.findByType('button').props.onClick());
  assert.equal(sharedLink.url, copiedLink); assert.equal(tree.root.findAllByType('input').length, 0);
  shareNavigator.share = async () => { const error = new Error('Cancelled'); error.name = 'AbortError'; throw error; };
  await act(async () => tree.root.findByType('button').props.onClick());
  assert.equal(tree.root.findAllByType('input').length, 0);
  await act(async () => tree.unmount());

  const icons = Object.fromEntries(['CalendarDays', 'ShoppingBag', 'HeartHandshake', 'Newspaper', 'Utensils', 'Ticket', 'UserRound', 'Settings'].map(name => [name, props => React.createElement('span', props)]));
  let degraded = false;
  const Dashboard = load('components/club-account/MemberDashboard.tsx', { ...common, 'lucide-react': icons,
    '@/components/calendar/UpcomingEventsStrip': { default: props => React.createElement('p', null, props.events.length ? 'Events loaded' : props.emptyMessage) },
    '@/components/calendar/AddToCalendarButton': { default: () => React.createElement('button', null, 'Add calendar') },
    './MemberInterests': { default: () => React.createElement('p', null, 'Interest controls') }, './MemberPurchases': { default: () => React.createElement('p', null, 'Purchase history') }, './ShareLink': { default: () => null },
  }, { fetch: async url => ({ ok: true, json: async () => ({ success: true, degraded, data: url.includes('/news') ? [{ id: 'news', title: 'Published club update', published_at: null }] : [] }) }), AbortController }).default;
  await act(async () => { tree = create(React.createElement(Dashboard, { email: 'owner@example.invalid', name: 'Test Member', status: 'pending', profileComplete: true }, React.createElement('p', null, 'Edit details form'))); });
  assert.match(content(tree), /Published club update/); assert.match(content(tree), /awaiting review/);
  assert.ok(tree.root.findAllByProps({ href: '/kitchen' }).length);
  assert.equal(tree.root.findAllByProps({ href: '/raffle/cash' }).length, 0);
  await act(async () => button(tree, 'My purchases').props.onClick()); assert.match(content(tree), /Purchase history/);
  await act(async () => button(tree, 'My details').props.onClick()); assert.match(content(tree), /Edit details form/);
  assert.ok(tree.root.findAllByProps({ href: '/club-account/reset-password' }).length);
  await act(async () => tree.unmount()); degraded = true;
  await act(async () => { tree = create(React.createElement(Dashboard, { email: 'owner@example.invalid', name: '', status: 'pending', profileComplete: false })); });
  await act(async () => button(tree, 'Overview').props.onClick()); assert.doesNotMatch(content(tree), /Published club update/); assert.match(content(tree), /temporarily unavailable/);
  await act(async () => tree.unmount());
  console.log('PASS member dashboard: verified ownership, wildcard-safe purchases, independent preferences, consent-only paginated export, safe payments, saved choices, service navigation and honest feed errors');
})().catch(error => { console.error(error); process.exitCode = 1; });
