// Club account hub (WP5): record claiming, data export, deletion requests,
// Dino Coach summary and admin review. Deterministic: no database or network.
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
  vm.runInNewContext(source, { exports, console, Error, Date, Set, Map, Object, Number, Array, JSON, URL, URLSearchParams, Response, Request, Intl, Promise, setTimeout, clearTimeout, ...globals, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name];
  } });
  return exports;
}
const normal = value => JSON.parse(JSON.stringify(value));
const next = { NextResponse: { json: (body, options) => Response.json(body, options) } };
const common = {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': { default: props => React.createElement('a', props) },
  '@/components/ui/Button': { default: props => React.createElement('button', props) },
  '@/components/ui/Input': { default: props => React.createElement('input', props) },
};
const content = tree => JSON.stringify(tree.toJSON());
const button = (tree, label) => tree.root.findAllByType('button').find(node => node.children.includes(label));
// Minimal chainable Supabase query stub. `resolve(state)` returns the result.
function query(log, table, resolve) {
  const state = { table, ops: [] };
  log.push(state);
  const chain = {};
  for (const method of ['select', 'eq', 'is', 'ilike', 'order', 'insert', 'update', 'upsert', 'not', 'neq', 'in', 'limit']) chain[method] = (...args) => { state.ops.push([method, ...args]); return chain; };
  for (const end of ['maybeSingle', 'single', 'range']) chain[end] = async (...args) => { state.ops.push([end, ...args]); return resolve(state, end); };
  chain.then = (onFulfilled, onRejected) => Promise.resolve(resolve(state, 'await')).then(onFulfilled, onRejected);
  return chain;
}
const has = (state, method, ...args) => state.ops.some(op => op[0] === method && args.every((arg, index) => op[index + 1] === arg));

(async () => {
  // 1. Claim selection.
  const { selectClaimCandidate } = load('lib/club-account/claim.ts');
  const row = (id, patch = {}) => ({ id, email: 'member@example.invalid', full_name: 'Alex Member', membership_status: 'pending', auth_user_id: null, created_at: '2026-09-01T00:00:00Z', ...patch });
  assert.equal(selectClaimCandidate([], 'member@example.invalid'), null);
  assert.equal(selectClaimCandidate([row('a')], ''), null, 'No verified email, no claim');
  assert.equal(selectClaimCandidate([row('a', { email: 'other@example.invalid' })], 'member@example.invalid'), null, 'Different email never matches');
  assert.equal(selectClaimCandidate([row('a', { auth_user_id: 'someone' })], 'member@example.invalid'), null, 'Claimed records are never taken');
  assert.equal(selectClaimCandidate([row('a', { email: ' Member@Example.INVALID ' })], 'MEMBER@example.invalid ').id, 'a', 'Email match is case-insensitive and trimmed');
  assert.equal(selectClaimCandidate([row('only', { membership_status: 'active' })], 'member@example.invalid').id, 'only', 'A single unclaimed match is linked on first sign-in');
  assert.equal(selectClaimCandidate([row('a', { membership_status: 'active', created_at: '2026-09-02' }), row('b', { created_at: '2026-09-05' })], 'member@example.invalid'), null, 'A shared email with several records is never guessed without a name');
  assert.equal(selectClaimCandidate([row('parent', { membership_status: 'active', full_name: 'Sam Parent', created_at: '2020-01-01' }), row('child', { full_name: 'Alex  member' })], 'member@example.invalid', ' alex member').id, 'child', 'A unique matching name links the right person behind a shared family email');
  assert.equal(selectClaimCandidate([row('parent', { membership_status: 'active', full_name: 'Sam Parent' })], 'member@example.invalid', 'Nobody Matches'), null, 'A name that matches no record links nothing');
  assert.equal(selectClaimCandidate([row('a', { full_name: 'Alex Member' }), row('b', { full_name: 'alex member' })], 'member@example.invalid', 'Alex Member'), null, 'Two records with the same name link nothing');
  assert.equal(selectClaimCandidate([row('b', { created_at: null }), row('a', { created_at: null })], 'member@example.invalid'), null, 'No tie-break guessing between records');

  // 2. Export shape and deletion request validation.
  const data = load('lib/club-account/account-data.ts');
  const purchaseLib = load('lib/club-account/purchases.ts');
  const purchase = (id, created_at) => ({ ...purchaseLib.memberPurchase({ id, payment_reference: `REF-${id}`, order_category: 'merch', total_amount: 10, amount_paid: 10, balance_due: 0, payment_status: 'paid', created_at, items: [] }) });
  const exported = normal(data.buildAccountExport({
    email: 'member@example.invalid', exportedAt: new Date('2026-09-26T01:02:03Z'),
    profile: { id: 'internal', auth_user_id: 'secret-auth', reviewed_by: 'staff', full_name: 'Alex Member', email: 'member@example.invalid', phone: '', member_type: 'social', membership_status: 'active', privacy_accepted_at: '2026-09-01', updated_at: '2026-09-02' },
    preferences: { member_id: 'internal', interests: ['club_news', 7], volunteering: [], email_updates: true, updated_at: '2026-09-03' },
    purchases: [purchase('old', '2026-01-01'), purchase('new', '2026-09-01')], truncated: false,
  }));
  assert.deepEqual(Object.keys(exported), ['format', 'version', 'exported_at', 'account', 'profile', 'preferences', 'purchases', 'purchases_truncated']);
  assert.equal(exported.format, 'ndcc-club-account-export'); assert.equal(exported.version, 1); assert.equal(exported.exported_at, '2026-09-26T01:02:03.000Z');
  assert.deepEqual(Object.keys(exported.profile), ['full_name', 'email', 'phone', 'member_type', 'membership_status', 'privacy_accepted_at', 'updated_at']);
  assert.doesNotMatch(JSON.stringify(exported), /secret-auth|internal|reviewed_by|staff/);
  assert.deepEqual(exported.preferences.interests, ['club_news']);
  assert.deepEqual(exported.purchases.map(item => item.id), ['new', 'old']);
  assert.equal(normal(data.buildAccountExport({ email: 'x@example.invalid', exportedAt: new Date(0), profile: null, preferences: null, purchases: [] })).profile, null);
  assert.equal(data.parseDeletionRequest({}), null, 'Explicit confirmation is required');
  assert.equal(data.parseDeletionRequest({ confirm: 'true' }), null);
  assert.equal(data.parseDeletionRequest({ confirm: true, reason: 5 }), null);
  assert.equal(data.parseDeletionRequest({ confirm: true, reason: 'x'.repeat(1001) }), null);
  assert.deepEqual(normal(data.parseDeletionRequest({ confirm: true, reason: '   ' })), { reason: null });
  assert.deepEqual(normal(data.parseDeletionRequest({ confirm: true, reason: ' No longer\u0000 local\nThanks ' })), { reason: 'No longer local\nThanks' });

  // 3. Deletion request API.
  let user = null, log = [], pending = null, tableMissing = false, insertFails = false, emails = [], rate = true;
  const deletionDb = { from: table => query(log, table, (state, end) => {
    if (table === 'club_members') return { data: { id: 'member-1', full_name: '<b>Alex</b>' }, error: null };
    if (tableMissing) return { data: null, error: { message: 'relation does not exist' } };
    if (has(state, 'insert')) return insertFails ? { data: null, error: { message: 'duplicate' } } : { data: { id: 'req-1', status: 'pending', created_at: '2026-09-26', actioned_at: null }, error: null };
    return end === 'maybeSingle' ? { data: pending, error: null } : { data: null, error: null };
  }) };
  const deletionRoute = load('app/api/club-account/deletion-request/route.ts', {
    'next/server': next, '@/lib/account/server-auth': { getAuthUserFromRequest: async () => user },
    '@/lib/supabase-server': { createServerClient: () => deletionDb },
    '@/lib/order-input-validation': { readLimitedJsonObject: async request => ({ ok: true, value: await request.json() }) },
    '@/lib/server/request-guards': { enforceRateLimit: async () => rate },
    '@/lib/club-account/account-data': data,
    '@/lib/email': { emailHtml: (title, body) => `<h1>${title}</h1>${body}`, escapeEmailHtml: value => String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;'),
      getContactEmailRecipients: () => ({ effectiveContactRecipient: 'club@example.invalid', cc: [] }), sendEmail: async payload => { emails.push(payload); return { status: 'sent' }; } },
  });
  const post = body => new Request('https://example.invalid/api/club-account/deletion-request', { method: 'POST', body: JSON.stringify(body) });
  const get = () => new Request('https://example.invalid/api/club-account/deletion-request');
  assert.equal((await deletionRoute.GET(get())).status, 401); assert.equal((await deletionRoute.POST(post({ confirm: true }))).status, 401); assert.equal(log.length, 0);
  user = { id: 'auth-1', email: 'member@example.invalid' };
  assert.equal((await deletionRoute.POST(post({ confirm: true }))).status, 401, 'Unconfirmed emails cannot request deletion');
  user.email_confirmed_at = '2026-09-01';
  tableMissing = true;
  let body = await (await deletionRoute.GET(get())).json();
  assert.equal(body.available, false, 'Missing table degrades to a hidden form'); assert.equal(body.request, null);
  assert.equal((await deletionRoute.POST(post({ confirm: true }))).status, 503); tableMissing = false;
  assert.equal((await deletionRoute.POST(post({ reason: 'no confirm' }))).status, 400);
  log = [];
  let response = await deletionRoute.POST(post({ confirm: true, reason: 'Moving <away>', auth_user_id: 'victim', status: 'actioned' }));
  assert.equal(response.status, 201); assert.match(response.headers.get('cache-control'), /private, no-store/);
  const insert = log.find(state => has(state, 'insert')).ops.find(op => op[0] === 'insert')[1];
  assert.deepEqual(normal(insert), { auth_user_id: 'auth-1', member_id: 'member-1', email: 'member@example.invalid', reason: 'Moving <away>' }, 'Server chooses identity and status');
  assert.equal(emails.length, 1); assert.equal(emails[0].to, 'club@example.invalid');
  assert.match(emails[0].html, /Moving &lt;away&gt;/); assert.match(emails[0].html, /&lt;b&gt;Alex/); assert.doesNotMatch(emails[0].html, /<b>Alex/);
  assert.equal(emails[0].idempotencyKey, 'club-account-deletion-req-1');
  assert.ok(!log.some(state => ['orders', 'raffle_orders', 'payments'].includes(state.table) || has(state, 'delete')), 'No ledger data is touched or deleted');
  pending = { id: 'req-1', status: 'pending', created_at: '2026-09-26', actioned_at: null }; log = [];
  body = await (await deletionRoute.POST(post({ confirm: true }))).json();
  assert.equal(body.request.id, 'req-1'); assert.ok(!log.some(state => has(state, 'insert')), 'A pending request is not duplicated'); assert.equal(emails.length, 1);
  body = await (await deletionRoute.GET(get())).json(); assert.equal(body.request.status, 'pending'); assert.equal(body.available, true);
  pending = null; insertFails = true; assert.equal((await deletionRoute.POST(post({ confirm: true }))).status, 503); insertFails = false;
  rate = false; assert.equal((await deletionRoute.POST(post({ confirm: true }))).status, 429); rate = true;

  // 4. Export API.
  log = [];
  const exportDb = { from: table => query(log, table, () => {
    if (table === 'club_members') return { data: { id: 'member-1', auth_user_id: 'auth-1', full_name: 'Alex', email: 'member@example.invalid', phone: '', member_type: 'social', membership_status: 'pending', privacy_accepted_at: null, updated_at: null }, error: null };
    if (table === 'club_account_preferences') return { data: { interests: [], volunteering: ['events'], email_updates: false, updated_at: null }, error: null };
    if (table === 'orders') return { data: [{ id: 'o1', payment_reference: 'REF1', order_category: 'merch', items: [], total_amount: 5, amount_paid: 0, balance_due: 5, payment_status: 'unpaid', order_status: 'submitted', created_at: '2026-09-01', notes: 'staff only' }], count: 1, error: null };
    return { data: [{ id: 'r1', payment_reference: 'RAF1', quantity: 2, amount_cents: 1000, status: 'paid', created_at: '2026-09-02', raffle_tickets: [{ ticket_number: 7, ticket_reference: 'T7' }] }], count: 501, error: null };
  }) };
  const exportRoute = load('app/api/club-account/export/route.ts', {
    'next/server': next, '@/lib/account/server-auth': { getAuthUserFromRequest: async () => user }, '@/lib/supabase-server': { createServerClient: () => exportDb },
    '@/lib/server/request-guards': { enforceRateLimit: async () => rate }, '@/lib/club-account/purchases': purchaseLib, '@/lib/club-account/account-data': data,
  });
  user = { id: 'auth-1', email: 'member_%@example.invalid', email_confirmed_at: 'yes' };
  response = await exportRoute.GET(new Request('https://example.invalid/api/club-account/export'));
  assert.equal(response.status, 200); assert.match(response.headers.get('content-disposition'), /attachment/);
  const file = await response.json();
  assert.equal(file.format, 'ndcc-club-account-export'); assert.deepEqual(file.purchases.map(item => item.id), ['r1', 'o1']);
  assert.equal(file.purchases_truncated, true); assert.deepEqual(file.preferences.volunteering, ['events']);
  assert.doesNotMatch(JSON.stringify(file), /auth-1|staff only|member-1/);
  assert.ok(log.filter(state => ['orders', 'raffle_orders'].includes(state.table)).every(state => has(state, 'ilike', 'customer_email', 'member\\_\\%@example.invalid')), 'Purchases match only the verified email');
  assert.ok(has(log.find(state => state.table === 'club_members'), 'eq', 'auth_user_id', 'auth-1'));
  user = null; assert.equal((await exportRoute.GET(new Request('https://example.invalid/api/club-account/export'))).status, 401);

  // 5. Dino Coach summary API (read-only).
  let manager = null; log = [];
  const dinoRoute = load('app/api/club-account/dino-coach/route.ts', {
    'next/server': next, '@/lib/account/server-auth': { getAuthUserFromRequest: async () => user },
    '@/lib/supabase-server': { createServerClient: () => ({ from: table => query(log, table, () => ({ data: manager, error: null })) }) },
    '@/lib/fantasy-seasons': { resolveRequestSeason: async () => ({ id: 'season-1' }) },
    '@/lib/dino-coach/standings': { getDinoManagerStandings: async () => [{ managerId: 'other', rank: 1, totalPoints: 90 }, { managerId: 'm1', rank: 2, totalPoints: 40 }] },
  });
  const dinoReq = () => new Request('https://example.invalid/api/club-account/dino-coach');
  assert.equal((await dinoRoute.GET(dinoReq())).status, 401);
  user = { id: 'auth-1', email: 'member@example.invalid', email_confirmed_at: 'yes' };
  assert.equal((await (await dinoRoute.GET(dinoReq())).json()).manager, null);
  manager = { id: 'm1', team_name: 'Dino Dashers', is_active: true, deleted_at: null };
  body = await (await dinoRoute.GET(dinoReq())).json();
  assert.deepEqual(body.manager, { team_name: 'Dino Dashers' }); assert.deepEqual(body.standing, { rank: 2, points: 40, managers: 2 });
  assert.ok(!log.some(state => has(state, 'insert') || has(state, 'update') || has(state, 'upsert')), 'The summary never writes');
  manager = { ...manager, deleted_at: '2026-09-01' }; assert.equal((await (await dinoRoute.GET(dinoReq())).json()).manager, null);

  // 6. Admin deletion request review.
  let admin = false; log = [];
  const adminRoute = load('app/api/admin/memberships/deletion-requests/route.ts', {
    'next/server': next, '@/lib/auth/guard': { requirePermissionResult: async permission => { assert.equal(permission, 'memberships'); return admin ? { user: { id: 'staff-1' } } : { user: null, status: 403, error: 'Forbidden' }; } },
    '@/lib/order-input-validation': { readLimitedJsonObject: async request => ({ ok: true, value: await request.json() }) },
    '@/lib/supabase-server': { createServerClient: () => ({ from: table => query(log, table, (state, end) => end === 'maybeSingle' ? { data: { id: 'req' }, error: null } : { data: [{ id: 'req', status: 'pending' }], error: null }) }) },
  });
  const patch = value => new Request('https://example.invalid/api/admin/memberships/deletion-requests', { method: 'PATCH', body: JSON.stringify(value) });
  const id = '00000000-0000-4000-8000-000000000001';
  assert.equal((await adminRoute.GET()).status, 403); assert.equal((await adminRoute.PATCH(patch({ id, status: 'actioned' }))).status, 403); assert.equal(log.length, 0);
  admin = true;
  assert.equal((await (await adminRoute.GET()).json()).requests.length, 1);
  assert.equal((await adminRoute.PATCH(patch({ id, status: 'pending' }))).status, 400);
  assert.equal((await adminRoute.PATCH(patch({ id: 'x', status: 'actioned' }))).status, 400);
  log = []; assert.equal((await adminRoute.PATCH(patch({ id, status: 'actioned' }))).status, 200);
  const update = log[0].ops.find(op => op[0] === 'update')[1];
  assert.equal(update.status, 'actioned'); assert.equal(update.actioned_by, 'staff-1');
  assert.ok(has(log[0], 'eq', 'status', 'pending'), 'Only pending requests can be actioned');
  assert.ok(!log.some(state => has(state, 'delete')));

  // 7. Account hub UI.
  let dinoSummary = { manager: null, standing: null };
  const Dino = load('components/club-account/MemberDinoCoach.tsx', { ...common, '@/lib/club-account/browser': { clubAccountJsonFetch: async () => dinoSummary } }).default;
  let tree;
  await act(async () => { tree = create(React.createElement(Dino)); });
  assert.ok(tree.root.findAllByProps({ href: '/fantasy/register' }).length); assert.equal(tree.root.findAllByProps({ href: '/fantasy/team' }).length, 0);
  await act(async () => tree.unmount());
  dinoSummary = { manager: { team_name: 'Dino Dashers' }, standing: { rank: 3, points: 55, managers: 12 } };
  await act(async () => { tree = create(React.createElement(Dino)); });
  assert.match(content(tree), /Dino Dashers/); assert.match(content(tree), /"3"," of ","12"/); assert.ok(tree.root.findAllByProps({ href: '/fantasy/team' }).length);
  await act(async () => tree.unmount());

  let updated = null, deletionState = { request: null, available: true }, posted = null;
  const Settings = load('components/club-account/AccountSettings.tsx', { ...common,
    '@/lib/account/browser': { getAccountBrowserClient: () => ({ auth: { updateUser: async (attributes, options) => { updated = { attributes, options }; return { error: null }; } } }) },
    '@/lib/club-account/browser': { clubAccountJsonFetch: async (url, options) => {
      if (options?.method === 'POST') { posted = JSON.parse(options.body); return { request: { id: 'req', status: 'pending', created_at: '2026-09-26T00:00:00Z', actioned_at: null } }; }
      return deletionState;
    } },
  }, { window: { location: { origin: 'https://example.invalid' } } }).default;
  await act(async () => { tree = create(React.createElement(Settings, { email: 'member@example.invalid' })); });
  const emailForm = tree.root.findAllByType('form')[0];
  await act(async () => emailForm.props.onSubmit({ preventDefault() {}, currentTarget: { elements: { namedItem: () => ({ value: ' New@Example.invalid ' }) } } }));
  assert.equal(updated.attributes.email, 'new@example.invalid'); assert.equal(updated.options.emailRedirectTo, 'https://example.invalid/club-account');
  assert.match(content(tree), /Check your inbox to confirm the change/);
  updated = null;
  await act(async () => emailForm.props.onSubmit({ preventDefault() {}, currentTarget: { elements: { namedItem: () => ({ value: 'MEMBER@example.invalid' }) } } }));
  assert.equal(updated, null, 'The current email is not resubmitted');
  await act(async () => button(tree, 'Request account deletion').props.onClick());
  await act(async () => tree.root.findAllByType('form').at(-1).props.onSubmit({ preventDefault() {} }));
  assert.equal(posted.confirm, true); assert.match(content(tree), /waiting for the club to action it/);
  await act(async () => tree.unmount());
  deletionState = { request: null, available: false };
  await act(async () => { tree = create(React.createElement(Settings, { email: 'member@example.invalid' })); });
  assert.doesNotMatch(content(tree), /Delete my account/, 'Deletion form hidden until the table exists'); assert.match(content(tree), /Download my data/);
  await act(async () => tree.unmount());

  // 8. Migrations: additive, private, reversible.
  const requests = fs.readFileSync('supabase/migrations/20260926082423_club_account_deletion_requests.sql', 'utf8');
  for (const pattern of [/Rollback:/, /set local lock_timeout = '3s'/, /enable row level security/, /revoke all on public\.club_account_deletion_requests from public,anon,authenticated/, /check\(status in \('pending','actioned'\)\)/, /where status = 'pending'/]) assert.match(requests, pattern);
  assert.doesNotMatch(requests.replace(/^--.*$/gm, ''), /\b(drop|truncate)\b|\bdelete from\b/i, 'Only the rollback comment drops anything');
  const guard = fs.readFileSync('supabase/migrations/20260926082444_fantasy_manager_auth_user_delete_guard.sql', 'utf8');
  for (const pattern of [/Rollback:/, /after delete on auth\.users/, /security definer\s+set search_path = ''/, /set auth_user_id = null/, /revoke all on function public\.ndcc_clear_fantasy_manager_auth_user\(\) from public, anon, authenticated/]) assert.match(guard, pattern);
  assert.doesNotMatch(guard.replace(/^--.*$/gm, ''), /foreign key|references/i, 'No FK that could fail on existing orphan rows');

  // 9. Club account code paths carry no Dino Coach wording in errors.
  for (const file of ['app/club-account/ClubAccount.tsx', 'lib/club-account/browser.ts', 'app/api/club-account/route.ts', 'app/api/club-account/purchases/route.ts', 'app/api/club-account/preferences/route.ts', 'app/api/club-account/export/route.ts', 'app/api/club-account/deletion-request/route.ts']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source.replace(/^\s*(\/\/|import).*$/gm, ''), /fantasy|Dino/i, `${file} must stay product-neutral`);
  }
  // Confirmed email change reaches the club contact record.
  {
    const updates = [];
    const profile = { id: 'm1', full_name: 'A Member', email: 'old@example.invalid', phone: null, member_type: 'social', membership_status: 'active', privacy_accepted_at: '2026-09-01', updated_at: null };
    const db = { from: () => {
      const chain = { select: () => chain, eq: () => chain,
        update: record => { updates.push(record); chain.updating = true; return chain; },
        maybeSingle: async () => ({ data: chain.updating ? { ...profile, email: 'new@example.invalid' } : profile, error: null }) };
      return chain;
    } };
    const route = load('app/api/club-account/route.ts', {
      'next/server': next,
      '@/lib/account/server-auth': { getAuthUserFromRequest: async () => ({ id: 'u1', email: 'New@Example.invalid', email_confirmed_at: '2026-09-26' }) },
      '@/lib/supabase-server': { createServerClient: () => db },
      '@/lib/order-input-validation': { readLimitedJsonObject: async () => ({ ok: false }) },
      '@/lib/server/request-guards': { enforceRateLimit: async () => true },
      '@/lib/club-members': { parseClubMember: () => null },
      '@/lib/club-account/claim': { selectClaimCandidate: () => null },
      '@/lib/club-account/purchases': { exactEmailPattern: value => value },
    });
    const body = await (await route.GET(new Request('https://example.invalid/api/club-account'))).json();
    assert.equal(updates.length, 1, 'A changed confirmed email updates the club record once');
    assert.deepEqual(Object.keys(updates[0]).sort(), ['email', 'updated_at'], 'Only the email is synchronised');
    assert.equal(updates[0].email, 'new@example.invalid');
    assert.equal(body.profile.email, 'new@example.invalid');
  }
  console.log('PASS club account hub: safe record claiming, private export shape, validated deletion requests without ledger deletion, read-only Dino Coach summary, admin actioning, email change and additive migrations');
})().catch(error => { console.error(error); process.exitCode = 1; });
