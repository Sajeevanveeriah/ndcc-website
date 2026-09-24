import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import * as jsx from 'react/jsx-runtime';

function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'exports', code)(name => {
    assert.ok(name in dependencies, `Unexpected dependency ${name} in ${file}`);
    const dependency = dependencies[name];
    return dependency && Object.hasOwn(dependency, 'default') ? { __esModule: true, ...dependency } : dependency;
  }, exports);
  return exports;
}

const config = load('lib/auth/config.ts');
const permissions = load('lib/auth/permissions.ts', { './config': config });
let resolution;
const guards = load('lib/auth/guard.ts', {
  'next/headers': { cookies: async () => ({ get: () => ({ value: 'test-only-token' }) }) },
  './config': config, './permissions': permissions,
  './session': { resolveSessionFromToken: async () => resolution, getSessionUserFromToken: async () => resolution.user },
});
for (const reason of ['timeout', 'database_error', 'network_error']) {
  resolution = { status: 'unavailable', reason };
  assert.equal((await guards.requirePermissionResult('sponsors')).status, 503);
}
for (const reason of ['missing_token', 'session_not_found', 'expired', 'inactive_user']) {
  resolution = { status: 'unauthenticated', reason };
  assert.equal((await guards.requirePermissionResult('sponsors')).status, 401);
}
resolution = { status: 'authenticated', user: { role: 'committee', permissions: ['news'] } };
assert.equal((await guards.requirePermissionResult('sponsors')).status, 403);
resolution.user.permissions.push('sponsors');
assert.equal((await guards.requirePermissionResult('sponsors')).status, 200);
for (const role of config.FULL_ACCESS_ROLES) {
  resolution.user = { role, permissions: permissions.getEffectivePermissions(role, []) };
  assert.equal((await guards.requirePermissionResult('sponsors')).status, 200);
}
console.log('PASS session outage, expiry and permission denial remain distinct; executive and scoped permissions preserved');

const client = load('lib/admin-client.ts');
const originalFetch = globalThis.fetch;
let calls, replies;
const response = (status, body = {}) => Response.json(body, { status });
globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  const reply = replies.shift();
  assert.ok(reply, 'No unexpected request/retry');
  if (reply instanceof Error) throw reply;
  return reply;
};
try {
  calls = []; replies = [response(503), response(200, { data: [1] })];
  assert.deepEqual(await (await client.adminFetch('/api/admin/resources/sponsors')).json(), { data: [1] });
  assert.equal(calls.length, 2);
  for (const method of ['GET', 'HEAD']) {
    calls = []; replies = [new TypeError('Failed to fetch'), response(200)];
    assert.equal((await client.adminFetch('/api/admin/resources/sponsors', { method })).status, 200);
    assert.equal(calls.length, 2);
  }
  calls = []; replies = [new TypeError('Failed to fetch'), response(503)];
  assert.equal((await client.adminFetch('/api/admin/resources/sponsors')).status, 503);
  assert.equal(calls.length, 2, 'a network retry does not add a second status retry');
  calls = []; replies = [new DOMException('Aborted', 'AbortError')];
  await assert.rejects(client.adminFetch('/api/admin/resources/sponsors'), /timed out/);
  assert.equal(calls.length, 1, 'aborted requests are not replayed');
  calls = []; replies = [response(403), response(200, { authenticated: true }), response(200)];
  assert.equal((await client.adminFetch('/api/admin/resources/sponsors')).status, 200);
  assert.equal(calls[1].url, '/api/admin/auth/session');
  calls = []; replies = [response(403), response(503)];
  await assert.rejects(client.adminFetch('/api/admin/resources/sponsors'), /temporarily unavailable/);
  calls = []; replies = [response(403), response(401)];
  await assert.rejects(client.adminFetch('/api/admin/resources/sponsors'), /sign in again/);
  calls = []; replies = [response(403), response(200, { authenticated: true }), response(403)];
  assert.equal((await client.adminFetch('/api/admin/resources/sponsors')).status, 403, 'real permission denial is not bypassed');
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    calls = []; replies = [response(503)];
    assert.equal((await client.adminFetch('/api/admin/resources/playerSponsors', { method, body: '{}' })).status, 503);
    assert.equal(calls.length, 1, 'writes are never replayed');
    assert.equal(calls[0].options.headers.get('X-NDCC-CSRF'), '1');
    assert.equal(calls[0].options.credentials, 'include');
    calls = []; replies = [new TypeError('Failed to fetch')];
    await assert.rejects(client.adminFetch('/api/admin/resources/playerSponsors', { method, body: '{}' }), /Failed to fetch/);
    assert.equal(calls.length, 1, 'network failures never replay writes');
  }
} finally { globalThis.fetch = originalFetch; }
console.log('PASS bounded read recovery, permission failure, expired session and no mutation replay');

const links = load('lib/public-link-url.ts');
const playerHelpers = load('lib/player-sponsors.ts', { './public-link-url': links });
const realRow = { id: 'saved', player_name: 'Test player', sponsor_name: 'Test sponsor', player_image_url: '', logo_url: '', website: '', sort_order: 0, active: true };
let failLoad = true, saved;
const component = load('app/admin/sponsors/players/page.tsx', {
  react: React, 'react/jsx-runtime': jsx, 'next/link': { default: 'a' },
  '@/lib/player-sponsors': playerHelpers,
  '@/lib/admin-client': {
    parseApiResponse: client.parseApiResponse,
    adminFetch: async (_url, options) => {
      if (options?.method) { saved = JSON.parse(options.body); return response(200, { data: { ...realRow, ...saved } }); }
      if (failLoad) return response(503, { error: 'Session validation is temporarily unavailable. Please retry.' });
      return response(200, { data: [realRow] });
    },
  },
  '@/components/ui/Button': { default: ({ children, isLoading, ...props }) => React.createElement('button', { ...props, 'data-loading': isLoading }, children) },
  '@/components/ui/Input': { default: ({ label, ...props }) => React.createElement('input', { ...props, 'aria-label': label }) },
  '@/components/ui/Modal': { default: ({ isOpen, children }) => isOpen ? React.createElement('div', {}, children) : null },
  '@/components/admin/ImageUploadField': { default: () => null },
}).default;
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
let view;
const button = label => view.root.findAllByType('button').find(node => text(node) === label);
await act(async () => { view = TestRenderer.create(React.createElement(component)); });
assert.match(text(view.root), /temporarily unavailable/);
assert.doesNotMatch(text(view.root), /No player sponsors added yet/);
failLoad = false;
await act(async () => button('Retry loading player sponsors').props.onClick());
assert.match(text(view.root), /Test player/);
assert.match(text(view.root), /Visible/);
await act(async () => button('Add player sponsor').props.onClick());
assert.equal(view.root.findByProps({ type: 'checkbox' }).props.checked, true, 'new sponsors default to public visibility');
await act(async () => view.root.findByProps({ id: 'player-name' }).props.onChange({ target: { value: 'New player' } }));
await act(async () => view.root.findByProps({ id: 'player-sponsor-name' }).props.onChange({ target: { value: 'New sponsor' } }));
await act(async () => view.root.findByType('form').props.onSubmit({ preventDefault() {} }));
assert.equal(saved.active, true);
assert.match(text(view.root), /saved and published/);
await act(async () => button('Add player sponsor').props.onClick());
await act(async () => view.root.findByProps({ id: 'player-name' }).props.onChange({ target: { value: 'Hidden player' } }));
await act(async () => view.root.findByProps({ id: 'player-sponsor-name' }).props.onChange({ target: { value: 'Hidden sponsor' } }));
await act(async () => view.root.findByProps({ type: 'checkbox' }).props.onChange({ target: { checked: false } }));
await act(async () => view.root.findByType('form').props.onSubmit({ preventDefault() {} }));
assert.equal(saved.active, false, 'intentional hidden entries remain possible');
assert.match(text(view.root), /saved as hidden/);
await act(async () => view.unmount());
console.log('PASS player-sponsor load failure, retry, visible create and intentional hidden create');

const operationRequests = [];
const operationReplies = [new Response('<html>Unexpected upstream response</html>')];
const health = { observedAt: '2026-09-24T00:00:00Z', databaseBytes: 12000000, receiptQueue: {}, emailOutcomes: {}, lastEmailEvent: null, expiredSessions: 0 };
const Operations = load('app/admin/operations/page.tsx', {
  react: React, 'react/jsx-runtime': jsx,
  '@/lib/admin-client': {
    parseApiResponse: client.parseApiResponse,
    adminFetch: async (url, options) => {
      operationRequests.push({ url, method: options?.method || 'GET' });
      assert.ok(operationReplies.length, 'No unexpected operations request');
      return operationReplies.shift();
    },
  },
}).default;
let operationsView;
await act(async () => { operationsView = TestRenderer.create(React.createElement(Operations)); });
assert.match(text(operationsView.root), /invalid response.*retry/i);
assert.doesNotMatch(text(operationsView.root), /Unexpected token|NaN/);
const refreshOperations = () => operationsView.root.findAllByType('button').find(node => text(node) === 'Refresh checks').props.onClick();
operationReplies.push(response(200, health));
await act(async () => refreshOperations());
assert.match(text(operationsView.root), /12.0 MB/);
assert.equal(operationsView.root.findAllByProps({ role: 'alert' }).length, 0);
operationReplies.push(response(503, { error: 'Operational checks are temporarily unavailable.' }));
await act(async () => refreshOperations());
assert.match(text(operationsView.root), /temporarily unavailable/);
assert.match(text(operationsView.root), /12.0 MB/, 'previous health remains available after a failed refresh');
assert.ok(operationRequests.every(request => request.method === 'GET'), 'refresh must never process or send receipts');
await act(async () => operationsView.unmount());
console.log('PASS operations malformed response, refresh recovery and no receipt processing');
