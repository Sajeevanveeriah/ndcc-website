import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const walletExports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('lib/dino-coach/wallet.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: walletExports });

const player = { id: 'eligible', display_name: 'Eligible player', role: 'BAT', price_dino_dollars: 101000, published_at: '2026-09-16' };
const slot = { key: 'XI_BAT_1', role: 'BAT', positionType: 'starter', label: 'Batter 1' };
const pick = { slotKey: slot.key, playerId: 'excluded', displayName: 'Removed player', assignedRole: 'BAT', positionType: 'starter', purchasePriceDinoDollars: 100001 };
const source = ts.transpileModule(readFileSync('app/fantasy/_components/SquadBuilder.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
function render(selection, readonlyMode = false, issues = []) {
  const states = [issues, [player], [slot], selection, { budget_dino_dollars: 10000000, team_selection_open: true }, '', 'name', '', '', '', false, false];
  let index = 0;
  const exports = {};
  const div = ({ children }) => React.createElement('div', null, children);
  const imports = {
    react: { useState: () => [states[index++], () => {}], useEffect: () => {}, useCallback: (fn) => fn, useMemo: (fn) => fn() },
    'react/jsx-runtime': jsx,
    '@/lib/dino-coach/season-summary': { CRICKET_ROLE_LABELS: { BAT: 'Batter' } },
    'next/link': { default: 'a' },
    '@/components/ui/Button': { default: ({ children, disabled }) => React.createElement('button', { disabled }, children) },
    '@/components/ui/Card': { default: div, CardContent: div },
    '@/lib/fantasy-browser': {},
    './WalletPanel': { default: () => null },
    './PlayerStatsCard': { default: ({ player }) => React.createElement('div', null, player.display_name) },
    '@/lib/dino-coach/wallet': walletExports,
    './useSeasonParam': { useSeasonParam: () => ({ query: '' }) },
  };
  vm.runInNewContext(source, { exports, require: (name) => {
    assert(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  } });
  return renderToStaticMarkup(React.createElement(exports.default, { readonlyMode }));
}

const excluded = render([pick]);
assert.match(excluded, /Removed player/);
assert.match(excluded, /No longer eligible for this season/);
assert.match(excluded, />Sell \/ remove<\/button>/);
assert.match(excluded, /<button disabled="">Submit squad/);
assert.match(excluded, /<button disabled="">Save draft/);
const eligible = render([{ ...pick, playerId: player.id }]);
assert.doesNotMatch(eligible, /Replace ineligible players/);
assert.match(eligible, /9,899,999 Dino Dollars/);
assert.match(eligible, /100,001 Dino Dollars/);
assert.match(eligible, /<button>Submit squad/);
const historical = render([{ ...pick, playerId: player.id }], true);
assert.match(historical, /100,001 Dino Dollars/);
assert.doesNotMatch(historical, /<button[^>]*>Submit squad/);
console.log('PASS excluded picks remain visible and removable, saving is blocked, editable budgets preserve purchase costs, historical values are preserved');

const rulesBlocked = render([], false, [{code:'rules',message:'Accept the updated rules.'}]);
assert.match(rulesBlocked, /Accept the updated rules/);
assert.match(rulesBlocked, /Open My account in a new tab/);
assert.match(rulesBlocked, /Recheck account status/);
assert.match(rulesBlocked, /<button disabled="">Save draft/);
console.log('PASS rules recovery is visible before saving and links to account acceptance');
