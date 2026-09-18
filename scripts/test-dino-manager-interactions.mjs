// Exercise the real React pages, hooks, shared controls and click handlers.
// Only network/auth and browser globals are fixtures; no live account is changed.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const manager = { id: 'manager', display_name: 'Participant', team_name: 'Test XI', email: 'old@example.invalid', updated_at: '2026-01-01T00:00:00Z', initial_squad_due_at: '2099-01-01T00:00:00Z', is_active: true, team_name_status: 'approved', deleted_at: null, first_squad_completed_at: null };
const detail = { manager, entry: { status: 'paid' }, squads: [], slots: [{ key: 'XI_BAT_1', label: 'Batter', role: 'BAT', positionType: 'starter' }], players: [{ id: 'player', display_name: 'Player', price_dino_dollars: 100 }], budget: 10000000, rounds: [], events: [], notifications: [] };
let isAdmin = true, patchError = null, signOutError = null, signOuts = 0;
const requests = [];
const feedbackRequests = [];
let feedbackFails = true;
const feedbackFetch = async (url, init) => {
  assert.equal(url, '/api/fantasy/feedback');
  const body = JSON.parse(init.body); feedbackRequests.push(body);
  return { ok: !feedbackFails, json: async () => feedbackFails ? { success: false, error: 'Please retry shortly.' } : { success: true, reference: body.id } };
};
const windowFixture = { location: { search: '', href: '/fantasy/account', origin: 'https://example.invalid' }, history: { replaceState() {} } };
const documentFixture = { body: { style: {} }, addEventListener() {}, removeEventListener() {} };
const overrides = {
  'next/link': { __esModule: true, default: props => React.createElement('a', props) },
  '@/lib/admin-client': {
    parseApiResponse: async value => value,
    adminFetch: async (url, init) => {
      if (init?.method === 'PATCH') {
        const body = JSON.parse(init.body); requests.push(body);
        if (patchError) throw new Error(patchError);
        if ('deleted' in body.changes) manager.deleted_at = body.changes.deleted ? '2026-01-02T00:00:00Z' : null;
        if ('is_active' in body.changes) manager.is_active = body.changes.is_active;
        manager.updated_at = '2026-01-02T00:00:00Z';
        return { result: { changed: true } };
      }
      return structuredClone(url.includes('?id=') ? detail : { managers: [manager], season: { id: 'season', name: 'Test season' }, isAdmin });
    },
  },
  '@/lib/fantasy-browser': {
    isFantasySupabaseConfigured: true,
    fantasyJsonFetch: async url => url.endsWith('/players') ? { settings: { is_registration_open: true, rules_version: 'test' } } : structuredClone({ manager, entry: detail.entry, reactivationContacts: [] }),
    getFantasyBrowserClient: () => ({ auth: {
      getSession: async () => ({ data: { session: { user: { email: manager.email, user_metadata: {} } } } }),
      signOut: async () => { signOuts++; return { error: signOutError }; },
    } }),
  },
};
const modules = new Map();
function load(file) {
  file = resolve(file);
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} }; modules.set(file, module);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', 'window', 'document', 'fetch', code)(id => {
    if (id in overrides) return overrides[id];
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/') ? resolve(id.slice(2)) : resolve(dirname(file), id);
      const target = [base + '.ts', base + '.tsx', base].find(existsSync);
      if (!target) throw new Error(`Missing test import ${id}`);
      return load(target);
    }
    return require(id);
  }, module, module.exports, windowFixture, documentFixture, feedbackFetch);
  return module.exports;
}
const Page = load('app/admin/fantasy/managers/page.tsx').default;
const Account = load('app/fantasy/_components/FantasyAuthForms.tsx').FantasyAuthForm;
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
let view;
const buttons = () => view.root.findAllByType('button');
const button = label => buttons().find(node => text(node).trim() === label);
const field = id => view.root.findAllByType('input').find(node => node.props.id === id);
const type = async (id, value) => act(async () => field(id).props.onChange({ target: { value } }));
const click = async node => { assert.ok(node, 'Control exists'); assert.ok(!node.props.disabled, 'Control is enabled'); await act(async () => node.props.onClick()); };
const mount = async element => { await act(async () => { view = TestRenderer.create(element); }); };
const unmount = async () => act(async () => view.unmount());

await mount(React.createElement(Page));
await click(buttons().find(node => text(node).startsWith('View and edit')));
assert.equal(button('Delete team').props.disabled, true);
await type('delete-team-confirmation', 'delete team');
assert.equal(button('Delete team').props.disabled, true);
await type('delete-team-confirmation', 'DELETE TEAM');
assert.equal(button('Delete team').props.disabled, false);
// Reproduce the screenshot: a failed edit with a blank reason must not block deletion.
await type('edit-team-name', 'Unsaved unrelated name');
const playerSelect = view.root.findAllByType('select').find(node => React.Children.toArray(node.props.children).some(child => child.props?.value === 'player'));
await act(async () => playerSelect.props.onChange({ target: { value: 'player' } }));
await click(button('Save changes and notify manager'));
assert.equal(requests.length, 0);
assert.match(text(view.root), /Enter a reason for this change/);
await click(button('Delete team'));
assert.equal(requests.length, 1);
assert.deepEqual(requests[0].changes, { deleted: true });
assert.equal(requests[0].reason, 'Team deleted by the administrator.');
assert.equal(requests[0].selection, undefined, 'Deletion does not submit an incomplete or edited squad');
assert.equal(requests[0].confirmation, 'DELETE TEAM');
assert.match(text(view.root), /Team deleted\. The manager notification is queued/);
assert.ok(button('Restore team'));
await click(buttons().find(node => node.props['aria-label'] === 'Close'));
assert.ok(!buttons().some(node => text(node).startsWith('View and edit')), 'Deleted team leaves active list');
const filter = view.root.findAllByType('select').find(node => React.Children.toArray(node.props.children).some(child => child.props?.value === 'deleted'));
await act(async () => filter.props.onChange({ target: { value: 'deleted' } }));
await click(buttons().find(node => text(node).startsWith('View and edit')));
await click(button('Restore team'));
assert.deepEqual(requests.at(-1).changes, { deleted: false, is_active: true });
assert.match(text(view.root), /Team restored/);
await click(button('Reactivate for five days'));
assert.match(requests.at(-1).reason, /reactivated for five days/);
// A stale-team error remains visible; no success message is shown.
await type('delete-team-confirmation', 'DELETE TEAM');
await type('edit-reason', 'Removing my test team');
patchError = 'This team changed since you opened it. Reload before saving.';
await click(button('Delete team'));
assert.equal(requests.at(-1).reason, 'Removing my test team');
assert.match(text(view.root), /Reload before saving/);
assert.ok(button('Delete team'));
await unmount();

isAdmin = false;
await mount(React.createElement(Page));
await click(buttons().find(node => text(node).startsWith('View and edit')));
assert.ok(!button('Delete team') && !button('Restore team'));
assert.ok(button('Reactivate for five days'));
await unmount();

manager.deleted_at = '2026-01-02T00:00:00Z';
await mount(React.createElement(Account, { mode: 'account' }));
assert.match(text(view.root), /Your team has been deleted/);
assert.ok(!button('Save profile') && !button('Pay AUD 25.00 entry'));
assert.ok(!view.root.findAllByType('a').some(node => node.props.href === '/fantasy/squad'));
assert.ok(!field('teamName'));
signOutError = new Error('Sign out failed. Please retry.');
await click(button('Sign out and register with a different email'));
assert.equal(windowFixture.location.href, '/fantasy/account');
assert.match(text(view.root), /Sign out failed/);
signOutError = null;
await click(button('Sign out and register with a different email'));
assert.equal(signOuts, 2);
assert.equal(windowFixture.location.href, '/fantasy/register');
await unmount();
console.log('PASS real React interactions: typed confirmation, blank-reason deletion after failed edit, dirty-squad isolation, deleted filter, restoration, reactivation, custom reason, stale error, reviewer controls and deleted-account sign-out/re-registration');

const Feedback = load('app/fantasy/_components/DinoFeedbackForm.tsx').default;
await mount(React.createElement(Feedback));
await type('feedback-name', 'Visitor');
await type('feedback-email', 'visitor@example.invalid');
await act(async () => view.root.findByType('textarea').props.onChange({ target: { value: 'The team page could explain this more clearly.' } }));
const submitFeedback = () => act(async () => view.root.findByType('form').props.onSubmit({ preventDefault() {} }));
await submitFeedback();
assert.match(text(view.root), /Please retry shortly/);
assert.equal(field('feedback-name').props.value, 'Visitor', 'Failed send retains entered feedback');
await submitFeedback();
assert.equal(feedbackRequests[0].id, feedbackRequests[1].id, 'Retry keeps its idempotency key');
await act(async () => view.root.findByType('textarea').props.onChange({ target: { value: 'A different feedback message after editing.' } }));
feedbackFails = false;
await submitFeedback();
assert.notEqual(feedbackRequests[1].id, feedbackRequests[2].id, 'Changed feedback gets a new key');
assert.match(text(view.root), /received your feedback/);
assert.equal(view.root.findAllByType('form').length, 0);
assert.ok(!('recipients' in feedbackRequests[2]));
await unmount();
console.log('PASS feedback form failure recovery, preserved inputs, stable retry IDs, new IDs after edits and saved confirmation');
