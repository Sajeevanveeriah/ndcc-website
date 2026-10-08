// Renders the team sheet gallery with sample rows and checks it is grouped by
// round, orders grade folders Men's, Women's, Juniors, and keeps every image's alt text.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const compile = (file) => ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load(file, imports) {
  const module = { exports: {} };
  vm.runInNewContext(compile(file), { module, exports: module.exports, require: (name) => imports[name], Intl, Date });
  return module.exports;
}
const matchDay = load('lib/match-day.ts', {});
const card = load('components/match-day/TeamSheetCard.tsx', { 'react/jsx-runtime': jsx, 'lucide-react': { FileText: () => null }, '@/lib/match-day': matchDay });
const rounds = load('components/match-day/TeamSheetRounds.tsx', { 'react/jsx-runtime': jsx, '@/components/match-day/TeamSheetCard': card, '@/lib/match-day': matchDay });

const sheet = (id, team_name, match_date, round_label, images) => ({ id, team_id: null, team_name, match_date, round_label, season_label: '2026/27', opponent: '', venue: '', start_time: '', players: [], notes: '', document_url: '', images });
const html = renderToStaticMarkup(React.createElement(rounds.default, { sheets: [
  sheet('1', 'Juniors', '2026-10-10', 'Round 1', [{ url: '/m/j.webp', alt: 'Juniors, Round 1 team sheet' }]),
  sheet('2', "Men's", '2026-10-10', 'Round 1', [{ url: '/m/m1.webp', alt: "Men's page 1" }, { url: '/m/m2.webp', alt: "Men's page 2" }]),
  sheet('3', "Women's", '2026-10-10', 'Round 1', [{ url: '/m/w.webp', alt: "Women's, Round 1 team sheet" }]),
  sheet('4', "Men's", '2026-10-17', 'Round 2', [{ url: '/m/r2.webp', alt: "Men's, Round 2 team sheet" }]),
] }));

const headings = [...html.matchAll(/<h([23])[^>]*>([^<]+)<\/h\1>/g)].map((match) => `h${match[1]}:${match[2].replace(/&#x27;/g, "'")}`);
assert.deepEqual(headings, ["h2:Round 2", "h3:Men's", 'h2:Round 1', "h3:Men's", "h3:Women's", 'h3:Juniors']);
assert.equal((html.match(/<img /g) || []).length, 5);
assert.ok(!/alt=""/.test(html), 'every image has alt text');
assert.match(html, /aria-labelledby="round-2026-27-round-1"/);
console.log('PASS: team sheet gallery groups by round, orders grade folders and keeps image alt text.');
