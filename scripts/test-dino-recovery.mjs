// Real request helper and React handlers, with isolated network fixtures only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = file => process.env.DINO_RECOVERY_BASELINE === '1'
  ? execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' }) : readFileSync(file, 'utf8');
function load(file, imports, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(source(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', ...Object.keys(globals), code)(id => {
    assert.ok(id in imports, `Unexpected import ${id}`); return imports[id];
  }, exports, ...Object.values(globals));
  return exports;
}

let requests = [], replies = [], deadline;
const client = load('lib/fantasy-browser.ts', { '@supabase/supabase-js': { createClient: () => null } }, {
  process: { env: {} },
  fetch: async (url, init) => { requests.push({ url, ...init }); const next = replies.shift(); if (next instanceof Error) throw next; return typeof next === 'function' ? next(init) : next; },
  setTimeout: callback => { deadline = callback; return 1; }, clearTimeout() {},
});
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const call = async (sequence, init) => { requests = []; replies = sequence; return client.fantasyJsonFetch('/test', init); };
assert.deepEqual(await call([json({ error: 'Unavailable' }, 503), json({ success: true })]), { success: true });
assert.equal(requests.length, 2);
assert.deepEqual(await call([new TypeError('Failed to fetch'), json({ ok: true })]), { ok: true });
assert.equal(requests.length, 2);
for (const failure of [new TypeError('Network lost'), json({ error: 'Unavailable' }, 503)]) {
  await assert.rejects(call([failure, json({ success: true })], { method: 'POST', body: '{}' }));
  assert.equal(requests.length, 1, 'Writes must never be replayed');
}
await assert.rejects(call([new Response('<html>Proxy error</html>')]), /unreadable response/);
await assert.rejects(call([json(null)]), /unreadable response/);
await assert.rejects(call([json({ success: false, error: 'Choose a captain.' })]), /Choose a captain/);
await assert.rejects(call([json({ error: 'Sign in is required.' }, 401)]), /Sign in is required/);
assert.equal(requests.length, 1, 'Do not replay authentication failures');
const abortBody = init => ({ ok: true, status: 200, json: () => new Promise((resolve, reject) => {
  init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }); deadline();
}) });
await assert.rejects(call([abortBody]), /taking too long/);
const caller = new AbortController();
await assert.rejects(call([init => ({ ok: true, status: 200, json: () => new Promise((resolve, reject) => {
  init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }); caller.abort();
}) })], { signal: caller.signal }), /taking too long/);
console.log('PASS safe read recovery, no write replays, invalid JSON rejection and cancellation through body reading');

const player = { id: 'one', display_name: 'Player One', role: 'BAT', price_dino_dollars: 100000, published_at: '2026-09-01' };
const other = { ...player, id: 'two', display_name: 'Player Two' };
const slot = { key: 'XI_BAT_1', role: 'BAT', positionType: 'starter', label: 'Batter 1' };
const snapshot = (version = null, selected = null) => ({ managerId: 'owner', eligibilityIssues: [], settings: { budget_dino_dollars: 15000000, team_selection_open: true, rules_version: 'rev06' }, players: [player, other], slots: [slot], squad: version ? {
  updated_at: version, budget_used_dino_dollars: 100000, fantasy_squad_players: [{ player_id: selected.id, fantasy_players: { display_name: selected.display_name }, slot_key: slot.key, assigned_role: 'BAT', position_type: 'starter', is_captain: true, is_vice_captain: false, purchase_price_dino_dollars: 100000 }],
} : null });
let current = snapshot(), failRead = true, failWrite = false, failAfterWrite = false, posted = [], concurrent = false;
const div = ({ children }) => React.createElement('div', null, children);
const shared = {
  react: React, 'react/jsx-runtime': jsx, 'next/link': { default: 'a' },
  '@/components/ui/Button': { default: ({ children, ...props }) => React.createElement('button', props, children) },
  '@/components/ui/Card': { default: div, CardContent: div },
};
const Builder = load('app/fantasy/_components/SquadBuilder.tsx', {
  ...shared, './WalletPanel': { default: () => null }, './PlayerStatsCard': { default: ({ player }) => React.createElement('p', null, player.display_name) },
  './useSeasonParam': { useSeasonParam: () => ({ query: '' }) },
  '@/lib/dino-coach/wallet': load('lib/dino-coach/wallet.ts', {}),
  '@/lib/dino-coach/season-summary': { CRICKET_ROLE_LABELS: { BAT: 'Batter' } },
  '@/lib/fantasy-browser': { fantasyJsonFetch: async (url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body); posted.push(body);
      if (failWrite) throw new Error('Choose a vice-captain.');
      current = snapshot(concurrent ? 'version-3' : 'version-2', concurrent ? other : player);
      failRead = failAfterWrite;
      return { selection: body.selection };
    }
    if (failRead) throw new Error('Service temporarily unavailable');
    return structuredClone(current);
  } },
}).default;
let view;
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const button = label => view.root.findAllByType('button').find(node => text(node) === label);
const click = async label => { const node = button(label); assert.ok(node, `${label} exists`); assert.ok(!node.props.disabled, `${label} enabled`); await act(async () => node.props.onClick()); };
await act(async () => { view = TestRenderer.create(React.createElement(Builder)); });
assert.match(text(view.root), /Service temporarily unavailable/);
assert.doesNotMatch(text(view.root), /0\/0|Team selection is closed/);
assert.ok(button('Retry loading squad'));
failRead = false;
await click('Retry loading squad');
await act(async () => view.root.findAllByType('select')[1].props.onChange({ target: { value: 'one' } }));
await click('Assign selected player');
failWrite = true;
await click('Submit squad');
assert.match(text(view.root), /Choose a vice-captain/);
assert.match(text(view.root), /1\/1/);
failWrite = false; failAfterWrite = true;
await click('Save draft');
assert.match(text(view.root), /draft saved/);
assert.match(text(view.root), /Your squad was saved, but/);
assert.equal(button('Save draft').props.disabled, true);
assert.equal(button('Sell / remove').props.disabled, true);
const writeCount = posted.length;
await click('Retry loading squad');
assert.equal(posted.length, writeCount, 'Recovery only reads; it must not repeat a save');
assert.equal(button('Save draft').props.disabled, true, 'Failed recovery keeps writes paused');
failRead = false;
await click('Retry loading squad');
assert.equal(button('Save draft').props.disabled, false);
failAfterWrite = false; concurrent = true;
await click('Save draft');
assert.equal(posted.at(-1).expectedUpdatedAt, 'version-2');
assert.equal(posted.at(-1).selection[0].playerId, 'one');
await click('Save draft');
assert.equal(posted.at(-1).expectedUpdatedAt, 'version-3');
assert.equal(posted.at(-1).selection[0].playerId, 'two', 'New version must carry the same snapshot selections, not overwrite another tab');
await act(async () => view.unmount());
current = snapshot(); current.settings.budget_dino_dollars = 99000;
await act(async () => { view = TestRenderer.create(React.createElement(Builder)); });
await act(async () => view.root.findAllByType('select')[1].props.onChange({ target: { value: 'one' } }));
await click('Assign selected player');
assert.match(text(view.root), /Budget exceeded by 1,000 Dino Dollars/);
assert.equal(button('Submit squad').props.disabled, true);
assert.equal(button('Save draft').props.disabled, true);
assert.equal(button('Sell / remove').props.disabled, false);
await click('Sell / remove');
assert.equal(button('Save draft').props.disabled, false);
assert.doesNotMatch(text(view.root), /Budget exceeded/);
await act(async () => view.unmount());
console.log('PASS failed initial load retry, retained edits on validation failure, confirmed saves despite refresh failure, read-only recovery and consistent concurrent snapshots');

let availabilityFails = true;
const Auth = load('app/fantasy/_components/FantasyAuthForms.tsx', {
  ...shared, '@/components/ui/Input': { default: props => React.createElement('input', props) },
  '@/lib/dino-coach/domain': { isAdultOnDate: () => true },
  '@/lib/fantasy-browser': { isFantasySupabaseConfigured: true, fantasyJsonFetch: async () => {
    if (availabilityFails) throw new Error('Service unavailable');
    return { settings: { is_registration_open: true, rules_version: 'rev06' } };
  } },
}).FantasyAuthForm;
await act(async () => { view = TestRenderer.create(React.createElement(Auth, { mode: 'register' })); });
assert.match(text(view.root), /Could not check registration availability/);
assert.doesNotMatch(text(view.root), /registration is currently closed/);
assert.equal(button('Register').props.disabled, true);
availabilityFails = false;
await click('Retry registration check');
assert.equal(button('Register').props.disabled, false);
assert.match(text(view.root), /rev06/);
await act(async () => view.unmount());
console.log('PASS registration outage is retryable and does not masquerade as a club closure');

let configured = true, launch = true, seasonExists = true, failTable = '', reloads = 0;
const Unavailable = load('components/fantasy/DinoServiceUnavailable.tsx', shared, {
  window: { location: { reload: () => { reloads++; } } },
}).default;
const Layout = load('app/fantasy/layout.tsx', {
  'react/jsx-runtime': jsx,
  '@/components/fantasy/InstallDinoCoach': { default: () => null },
  '@/components/fantasy/DinoFeedbackNotice': { default: () => null },
  '@/components/fantasy/DinoServiceUnavailable': { default: Unavailable },
  'next/navigation': { notFound: () => { throw new Error('NOT_FOUND'); } },
  '@/lib/supabase-server': {
    isServerSupabaseConfigured: () => configured,
    createServerClient: () => ({ from: table => {
      const chain = { select: () => chain, eq: () => chain, limit: () => chain, maybeSingle: async () => ({
        data: table === 'fantasy_seasons' ? (seasonExists ? { id: 'season' } : null) : { public_launch_enabled: launch },
        error: failTable === table ? { message: 'Database unavailable' } : null,
      }) }; return chain;
    } }),
  },
}).default;
for (failTable of ['fantasy_seasons', 'fantasy_dino_settings']) {
  await act(async () => { view = TestRenderer.create(await Layout({ children: 'PRIVATE GAME CONTENT' })); });
  assert.match(text(view.root), /temporarily unavailable/);
  assert.doesNotMatch(text(view.root), /PRIVATE GAME CONTENT/);
  await click('Try again');
  await act(async () => view.unmount());
}
assert.equal(reloads, 2, 'Retry reloads the current route');
failTable = ''; launch = false;
await assert.rejects(Layout({ children: 'game' }), /NOT_FOUND/);
launch = true; seasonExists = false;
await assert.rejects(Layout({ children: 'game' }), /NOT_FOUND/);
seasonExists = true;
await act(async () => { view = TestRenderer.create(await Layout({ children: 'OPEN GAME CONTENT' })); });
assert.match(text(view.root), /OPEN GAME CONTENT/);
await act(async () => view.unmount());
configured = false;
await act(async () => { view = TestRenderer.create(await Layout({ children: 'PRIVATE GAME CONTENT' })); });
assert.match(text(view.root), /temporarily unavailable/);
assert.doesNotMatch(text(view.root), /PRIVATE GAME CONTENT/);
await act(async () => view.unmount());
console.log('PASS failed launch checks show retry without exposing game content; confirmed disabled/missing seasons still return not found');
