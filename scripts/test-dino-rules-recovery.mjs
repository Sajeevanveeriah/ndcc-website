import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import * as jsx from 'react/jsx-runtime';

function load(file, imports) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)(id => { assert.ok(id in imports, id); return imports[id]; }, exports);
  return exports;
}
let authenticated = true, updateError = false, writes = [], filters = [];
const chain = { eq: (...args) => { filters.push(args); return chain; }, is: (...args) => { filters.push(args); return chain; }, select: () => chain, maybeSingle: async () => ({ data: updateError ? null : { id: 'owner' }, error: null }) };
const endpoint = load('app/api/fantasy/rules/accept/route.ts', {
  '@/lib/server/fantasy-mutation': { readFantasyMutation: async request => ({ body: await request.json() }) },
  'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
  '@/lib/fantasy-manager-auth': { resolveFantasyManagerAuth: async () => authenticated ? { auth: { manager: { id: 'owner' } } } : { auth: null, errorStatus: 401 } },
  '@/lib/fantasy-seasons': { resolveRequestSeason: async () => ({ id: 'season' }) },
  '@/lib/dino-coach/server': { getDinoCoachSettings: async () => ({ rules_version: 'rev06' }) },
  '@/lib/supabase-server': { createServerClient: () => ({ from: () => ({ update: patch => { writes.push(patch); return chain; } }) }) },
});
const accept = body => endpoint.POST({ json: async () => body });
for (const body of [{}, { rulesAccepted: false, rulesVersion: 'rev06' }, { rulesAccepted: true, rulesVersion: 'rev04' }]) assert.equal((await accept(body)).status, 400);
assert.equal(writes.length, 0);
authenticated = false;
assert.equal((await accept({ rulesAccepted: true, rulesVersion: 'rev06' })).status, 401);
assert.equal(writes.length, 0);
authenticated = true;
assert.equal((await accept({ managerId: 'someone-else', rulesAccepted: true, rulesVersion: 'rev06' })).status, 200);
assert.deepEqual(Object.keys(writes[0]).sort(), ['rules_accepted_at', 'rules_version_accepted']);
assert.deepEqual(filters, [['id', 'owner'], ['is_active', true], ['deleted_at', null]]);
updateError = true;
assert.equal((await accept({ rulesAccepted: true, rulesVersion: 'rev06' })).status, 503);

let accepted = false, failAcceptance = true, posted;
const player = { id: 'one', display_name: 'Selected player', role: 'BAT', price_dino_dollars: 100000, published_at: '2026-09-01' };
const slot = { key: 'XI_BAT_1', role: 'BAT', positionType: 'starter', label: 'Batter 1' };
const result = () => ({ managerId: 'owner', eligibilityIssues: accepted ? [] : [{ code: 'rules', message: 'Accept the current rules.' }], settings: { budget_dino_dollars: 15000000, team_selection_open: true, rules_version: 'rev06' }, players: [player], slots: [slot], squad: null });
const div = ({ children }) => React.createElement('div', null, children);
const Builder = load('app/fantasy/_components/SquadBuilder.tsx', {
  react: React, 'react/jsx-runtime': jsx, 'next/link': { default: 'a' },
  '@/components/ui/Button': { default: ({ children, ...props }) => React.createElement('button', props, children) },
  '@/components/ui/Card': { default: div, CardContent: div },
  './WalletPanel': { default: () => null }, './PlayerStatsCard': { default: ({ player }) => React.createElement('p', null, player.display_name) },
  './useSeasonParam': { useSeasonParam: () => ({ query: '?season=season' }) },
  '@/lib/dino-coach/wallet': { squadWallet: () => ({ remaining: 14900000 }) },
  '@/lib/dino-coach/season-summary': { CRICKET_ROLE_LABELS: { BAT: 'Batter' } },
  '@/lib/fantasy-browser': { fantasyJsonFetch: async (url, init) => {
    if (url.includes('/rules/accept')) {
      assert.deepEqual(JSON.parse(init.body), { rulesAccepted: true, rulesVersion: 'rev06' });
      if (failAcceptance) throw new Error('Acceptance temporarily unavailable');
      accepted = true; return { success: true };
    }
    if (init?.method === 'POST') { posted = JSON.parse(init.body); return { selection: posted.selection }; }
    return result();
  } },
}).default;
let view;
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const button = label => view.root.findAllByType('button').find(node => text(node) === label);
await act(async () => { view = TestRenderer.create(React.createElement(Builder)); });
assert.equal(button('Save draft').props.disabled, true);
assert.equal(button('Accept rules and keep my selections').props.disabled, true);
await act(async () => view.root.findAllByType('select')[1].props.onChange({ target: { value: 'one' } }));
await act(async () => button('Assign selected player').props.onClick());
await act(async () => view.root.findAllByType('input').find(node => node.props.type === 'checkbox').props.onChange({ target: { checked: true } }));
await act(async () => button('Accept rules and keep my selections').props.onClick());
assert.match(text(view.root), /Acceptance temporarily unavailable/);
assert.match(text(view.root), /1\/1/);
failAcceptance = false;
await act(async () => button('Accept rules and keep my selections').props.onClick());
assert.equal(button('Save draft').props.disabled, false);
assert.match(text(view.root), /1\/1/);
await act(async () => button('Save draft').props.onClick());
assert.equal(posted.selection[0].playerId, 'one');
assert.equal(posted.mode, 'draft');
await act(async () => view.unmount());
console.log('PASS explicit current-version consent, authenticated ownership, failed acceptance recovery, retained unsaved selections and draft save');
