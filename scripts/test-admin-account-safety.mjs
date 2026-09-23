#!/usr/bin/env node
// Regression tests for CMS account-safety rules (admin-only admin management,
// no self role change/deactivation, last-admin guard), meeting-minute action
// transitions, and the admin auth throttling/JSON-guard hardening.
// Runs fully offline against isolated adapters; never touches a database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(filename, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'process', code)((name) => {
    if (name === 'server-only') return {};
    assert.ok(name in dependencies, `Unexpected dependency ${name} from ${filename}`);
    return dependencies[name];
  }, module, module.exports, process);
  return module.exports;
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

const config = load('lib/auth/config.ts');
const permissions = load('lib/auth/permissions.ts', { './config': config });
const validation = load('lib/order-input-validation.ts');
const nextServer = { NextResponse: { json: (body, init = {}) => Response.json(body, init) } };

const admin = { id: 'admin-1', role: 'admin' };
const president = { id: 'president-1', role: 'president' };

await test('only admins may create or elevate to admin accounts', () => {
  const check = permissions.checkUserAdministrationChange;
  assert.equal(check({ actor: president, target: null, nextRole: 'admin', nextActive: true }).ok, false);
  assert.equal(check({ actor: admin, target: null, nextRole: 'admin', nextActive: true }).ok, true);
  assert.equal(check({ actor: president, target: null, nextRole: 'committee', nextActive: true }).ok, true);
  const committeeTarget = { id: 'u2', role: 'committee', is_active: true };
  assert.equal(check({ actor: president, target: committeeTarget, nextRole: 'admin', nextActive: true }).status, 403);
  assert.equal(check({ actor: president, target: committeeTarget, nextRole: 'treasurer', nextActive: true }).ok, true);
});

await test('non-admin full-access roles cannot reset, deactivate or edit admin accounts', () => {
  const check = permissions.checkUserAdministrationChange;
  const adminTarget = { id: 'admin-2', role: 'admin', is_active: true };
  for (const role of ['president', 'secretary', 'vice_president', 'treasurer']) {
    const decision = check({ actor: { id: 'x', role }, target: adminTarget, nextRole: 'admin', nextActive: true, activeAdminCount: 3 });
    assert.equal(decision.ok, false, role);
    assert.equal(decision.status, 403);
  }
  assert.equal(check({ actor: admin, target: adminTarget, nextRole: 'admin', nextActive: false, activeAdminCount: 2 }).ok, true);
});

await test('nobody may change their own role or deactivate themselves', () => {
  const check = permissions.checkUserAdministrationChange;
  const self = { id: 'president-1', role: 'president', is_active: true };
  assert.match(check({ actor: president, target: self, nextRole: 'treasurer', nextActive: true }).error, /own role/);
  assert.match(check({ actor: president, target: self, nextRole: 'president', nextActive: false }).error, /deactivate your own/);
  assert.equal(check({ actor: president, target: self, nextRole: 'president', nextActive: true }).ok, true, 'unchanged self edit is allowed');
});

await test('the last active admin cannot be demoted or deactivated', () => {
  const check = permissions.checkUserAdministrationChange;
  const lastAdmin = { id: 'admin-2', role: 'admin', is_active: true };
  assert.equal(check({ actor: admin, target: lastAdmin, nextRole: 'president', nextActive: true, activeAdminCount: 1 }).status, 409);
  assert.equal(check({ actor: admin, target: lastAdmin, nextRole: 'admin', nextActive: false, activeAdminCount: 1 }).status, 409);
  assert.equal(check({ actor: admin, target: lastAdmin, nextRole: 'admin', nextActive: false }).status, 409, 'unknown count fails closed');
  assert.equal(check({ actor: admin, target: lastAdmin, nextRole: 'president', nextActive: true, activeAdminCount: 2 }).ok, true);
  assert.equal(check({ actor: admin, target: { ...lastAdmin, is_active: false }, nextRole: 'committee', nextActive: false, activeAdminCount: 1 }).ok, true);
});

function usersDb(rows, calls) {
  return {
    from(table) {
      assert.equal(table, 'committee_users');
      const filters = [];
      let head = false;
      const query = {
        select(_columns, options) { head = Boolean(options?.head); return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        order() { return query; },
        async maybeSingle() {
          const row = rows.find((candidate) => filters.every(([key, value]) => candidate[key] === value));
          return { data: row ?? null, error: null };
        },
        then(resolve, reject) {
          const matched = rows.filter((candidate) => filters.every(([key, value]) => candidate[key] === value));
          return Promise.resolve(head ? { count: matched.length, error: null } : { data: matched, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, args) { calls.push({ name, args }); return { error: null }; },
  };
}

function loadUsersRoute(actor, rows, calls) {
  return load('app/api/admin/users/route.ts', {
    'next/server': nextServer,
    '@/lib/supabase-server': { createServerClient: () => usersDb(rows, calls) },
    '@/lib/auth/guard': { requireSession: async () => actor },
    '@/lib/auth/config': config,
    '@/lib/auth/permissions': permissions,
    '@/lib/order-input-validation': validation,
  });
}

const patch = (route, body) => route.PATCH(new Request('https://example.invalid/api/admin/users', { method: 'PATCH', body: typeof body === 'string' ? body : JSON.stringify(body) }));
const post = (route, body) => route.POST(new Request('https://example.invalid/api/admin/users', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));

await test('user administration API enforces admin-account and self-change rules end to end', async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'isolated-test';
  const rows = [
    { id: 'admin-1', email: 'a@example.invalid', full_name: 'Admin One', role: 'admin', is_active: true, cms_permissions: [] },
    { id: 'president-1', email: 'p@example.invalid', full_name: 'President', role: 'president', is_active: true, cms_permissions: [] },
    { id: 'committee-1', email: 'c@example.invalid', full_name: 'Committee', role: 'committee', is_active: true, cms_permissions: ['news'] },
  ];
  const calls = [];
  const asPresident = loadUsersRoute({ ...president, email: 'p@example.invalid' }, rows, calls);
  assert.equal((await patch(asPresident, { userId: 'admin-1', resetPassword: 'long-enough-password' })).status, 403);
  assert.equal((await patch(asPresident, { userId: 'admin-1', isActive: false })).status, 403);
  assert.equal((await patch(asPresident, { userId: 'committee-1', role: 'admin' })).status, 403);
  assert.equal((await patch(asPresident, { userId: 'president-1', role: 'treasurer' })).status, 403);
  assert.equal((await patch(asPresident, { userId: 'president-1', isActive: false })).status, 403);
  assert.equal((await post(asPresident, { email: 'n@example.invalid', fullName: 'New', role: 'admin', password: 'long-enough-password' })).status, 403);
  assert.equal(calls.length, 0, 'no RPC may run for a refused change');

  assert.equal((await patch(asPresident, { userId: 'committee-1', isActive: false })).status, 200, 'non-admin accounts stay manageable');
  assert.equal((await patch(asPresident, { userId: 'president-1', fullName: 'President Renamed', role: 'president', isActive: true, permissions: [] })).status, 200, 'self edits that keep role/active are allowed');

  const asAdmin = loadUsersRoute({ ...admin, email: 'a@example.invalid' }, rows, calls);
  const lastAdmin = await patch(asAdmin, { userId: 'admin-1', role: 'president', isActive: true, permissions: [] });
  assert.equal(lastAdmin.status, 403, 'self role change is refused before the last-admin rule');
  rows.push({ id: 'admin-2', email: 'b@example.invalid', full_name: 'Admin Two', role: 'admin', is_active: true, cms_permissions: [] });
  assert.equal((await patch(asAdmin, { userId: 'admin-2', isActive: false })).status, 200, 'an admin may deactivate another admin while one remains');
  rows.find((row) => row.id === 'admin-2').is_active = true;
  rows.find((row) => row.id === 'admin-1').is_active = false;
  assert.equal((await patch(asAdmin, { userId: 'admin-2', isActive: false })).status, 409, 'the last active admin is protected');
});

await test('user administration API rejects malformed JSON with 400', async () => {
  const route = loadUsersRoute({ ...admin, email: 'a@example.invalid' }, [], []);
  assert.equal((await patch(route, '{not json')).status, 400);
  assert.equal((await post(route, '{not json')).status, 400);
});

function minutesDb(minute, log) {
  return {
    from(table) {
      let write = null;
      const query = {
        select() { return query; },
        eq(key, value) { log.push(['eq', table, key, value]); return query; },
        async maybeSingle() { return { data: minute, error: null }; },
        insert(value) { log.push(['insert', table, value]); return Promise.resolve({ error: null }); },
        update(value) { write = value; log.push(['update', table, value]); return query; },
        then(resolve, reject) { return Promise.resolve({ error: write && minute?.failUpdate ? { code: 'X', message: 'secret detail' } : null }).then(resolve, reject); },
      };
      return query;
    },
  };
}

function loadActions(user, minute, log) {
  return load('app/api/meeting-minutes/[id]/actions/route.ts', {
    'next/server': nextServer,
    '@/lib/supabase-server': { createServerClient: () => minutesDb(minute, log) },
    '@/lib/auth/guard': { requirePermission: async () => user },
    '@/lib/order-input-validation': validation,
  });
}

const minuteId = '11111111-1111-4111-8111-111111111111';
const act = (route, action_type) => route.POST(
  new Request(`https://example.invalid/api/meeting-minutes/${minuteId}/actions`, { method: 'POST', body: JSON.stringify({ action_type }) }),
  { params: Promise.resolve({ id: minuteId }) },
);

await test('meeting minute actions load the minute, hide drafts from committee and enforce transitions', async () => {
  let log = [];
  assert.equal((await act(loadActions({ id: 'c', role: 'committee' }, null, log), 'accepted')).status, 404);
  assert.equal((await act(loadActions({ id: 'c', role: 'committee' }, { id: minuteId, status: 'draft' }, log), 'accepted')).status, 404);
  assert.equal((await act(loadActions({ id: 'a', role: 'admin' }, { id: minuteId, status: 'draft' }, log), 'accepted')).status, 409);
  assert.equal(log.some(([kind]) => kind === 'insert' || kind === 'update'), false, 'refused actions write nothing');

  log = [];
  const published = await act(loadActions({ id: 'c', role: 'committee' }, { id: minuteId, status: 'published' }, log), 'seconded');
  assert.equal(published.status, 200);
  assert.ok(log.some(([kind, table]) => kind === 'insert' && table === 'meeting_minute_actions'));
  assert.ok(log.some(([kind, table, value]) => kind === 'update' && table === 'meeting_minutes' && value.status === 'seconded'));
  assert.ok(log.some(([kind, table, key, value]) => kind === 'eq' && table === 'meeting_minutes' && key === 'status' && value === 'published'), 'status update is conditional on the loaded status');

  log = [];
  const failing = await act(loadActions({ id: 'a', role: 'admin' }, { id: minuteId, status: 'accepted', failUpdate: true }, log), 'seconded');
  assert.equal(failing.status, 500);
  assert.doesNotMatch(JSON.stringify(await failing.json()), /secret detail/, 'database error text is never returned');
});

await test('admin login throttles per IP and per email+IP, never per email alone', () => {
  const source = readFileSync('app/api/admin/auth/login/route.ts', 'utf8');
  assert.match(source, /admin-login-ip:\$\{ip\}/);
  assert.match(source, /admin-login-email-ip:\$\{emailKey\}\|\$\{ip\}/);
  assert.doesNotMatch(source, /`admin-login-email:\$\{emailKey\}`/);
  assert.match(source, /Invalid email or password\./, 'generic credential error is preserved');
});

await test('change-password is rate limited and guards its JSON body', () => {
  const source = readFileSync('app/api/admin/auth/change-password/route.ts', 'utf8');
  assert.match(source, /enforceRateLimit\(`admin-change-password-user:/);
  assert.match(source, /enforceRateLimit\(`admin-change-password-ip:/);
  assert.match(source, /readLimitedJsonObject\(request, 8 \* 1024\)/);
  assert.doesNotMatch(source, /await request\.json\(\)/);
  assert.doesNotMatch(readFileSync('app/api/admin/users/route.ts', 'utf8'), /await request\.json\(\)/);
});

console.log(`\ntest-admin-account-safety: ${passed} tests passed`);
