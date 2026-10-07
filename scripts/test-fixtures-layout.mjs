#!/usr/bin/env node
// /fixtures layout: match-day grouping, default expanded days with a native
// "Show more", one "Start time TBC" per all-TBC day, no repeated date in rows,
// NDCC Home/Away badges (lib/playhq/fixture-groups.ts and PlayHQTables), plus
// the home intro caption clearing the drawn cricket ball. No network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const cache = new Map();
function load(file) {
  const resolved = ['', '.tsx', '.ts'].map((ext) => file + ext).find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!resolved) throw new Error(`Cannot resolve ${file}`);
  if (cache.has(resolved)) return cache.get(resolved);
  const exports = {}; cache.set(resolved, exports);
  const code = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, module: { exports }, console, Intl, Date, Map, Set, Number, Math, require(name) {
    if (name === 'server-only') throw new Error(`${resolved} must stay free of server-only imports`);
    if (name.startsWith('@/')) return load(path.resolve(name.slice(2)));
    if (name.startsWith('.')) return load(path.resolve(path.dirname(resolved), name));
    return require(name);
  } }, { filename: resolved });
  return exports;
}
// vm results come from another realm; compare as plain JSON values.
const eq = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`  ok - ${name}`); }

const groups = load(path.resolve('lib/playhq/fixture-groups'));
const { FixtureDayGroups, FixtureList } = load(path.resolve('app/fixtures/_components/PlayHQTables'));

const fixture = (id, startsAt, home, away, grade = 'GCA 4 1st XI') => ({ id, startsAt, homeTeam: home, awayTeam: away, gradeName: grade, gradeId: grade, venue: 'Grinter Reserve', status: 'UPCOMING', playHQUrl: `https://www.playhq.com/game/${id}`, homeScore: null, awayScore: null });

test('groups by Melbourne match day in the given order, undated last', () => {
  const rows = [
    fixture('a', '2026-10-10', 'Newcomb & District 1sts', 'Teesdale 1st XI'),
    fixture('b', '2026-10-10', 'Teesdale 2nd XI', 'Newcomb & District 2nds'),
    // 11:30 pm UTC on 16 Oct is Saturday 17 Oct in Melbourne (UTC+11).
    fixture('c', '2026-10-16T23:30:00Z', 'Newcomb & District Women 1sts', 'Murgheboluc'),
    fixture('d', '2026-10-17', 'Lara', 'Newcomb & District 1sts'),
    fixture('e', null, 'Newcomb & District U15', 'TBC'),
  ];
  const result = groups.groupFixturesByDay(rows);
  eq(result.map((group) => [group.key, group.day, group.dateTime, group.fixtures.map((row) => row.id)]), [
    ['2026-10-10', 'Sat 10 Oct 2026', '2026-10-10', ['a', 'b']],
    ['2026-10-17', 'Sat 17 Oct 2026', '2026-10-17', ['c', 'd']],
    ['tbc', 'Date to be confirmed', null, ['e']],
  ]);
});

test('"Start time TBC" collapses to the group only when no game in it has a time', () => {
  const result = groups.groupFixturesByDay([
    fixture('a', '2026-10-10', 'Newcomb & District 1sts', 'Teesdale 1st XI'),
    fixture('b', '2026-10-10', 'Teesdale 2nd XI', 'Newcomb & District 2nds'),
    fixture('c', '2026-10-17T02:30:00Z', 'Newcomb & District Women 1sts', 'Murgheboluc'),
    fixture('d', '2026-10-17', 'Lara', 'Newcomb & District 1sts'),
  ]);
  eq(result.map((group) => group.timeTbc), [true, false]);
  assert.equal(groups.fixtureTimeLabel('2026-10-10', true), null, 'no per-row TBC under an all-TBC heading');
  assert.equal(groups.fixtureTimeLabel('2026-10-10', false), 'Start time TBC', 'per-row TBC in a mixed day');
  assert.equal(groups.fixtureTimeLabel('2026-10-17T02:30:00Z', true), '1:30 pm', 'a real time is always shown');
});

test('default expanded count and limits', () => {
  assert.equal(groups.DEFAULT_EXPANDED_GROUPS, 3);
  const days = ['a', 'b', 'c', 'd', 'e'];
  eq(groups.limitFixtureGroups(days), { shown: ['a', 'b', 'c'], more: ['d', 'e'] });
  eq(groups.limitFixtureGroups(days, 2), { shown: ['a', 'b'], more: ['c', 'd', 'e'] });
  eq(groups.limitFixtureGroups(days, 0), { shown: ['a'], more: ['b', 'c', 'd', 'e'] }, 'at least one day is always open');
  eq(groups.limitFixtureGroups(days, Number.NaN), { shown: ['a', 'b', 'c'], more: ['d', 'e'] });
  eq(groups.limitFixtureGroups(['a', 'b'], 3), { shown: ['a', 'b'], more: [] });
});

test('home/away for the club side reuses the team-page rule', () => {
  assert.equal(groups.clubVenueRole(fixture('a', null, 'Newcomb & District 1sts', 'Teesdale 1st XI')), 'Home');
  assert.equal(groups.clubVenueRole(fixture('b', null, 'Teesdale 2nd XI', 'Newcomb & District 2nds')), 'Away');
  assert.equal(groups.clubVenueRole(fixture('c', null, 'St Josephs Fitzgerald U17 Boys', 'Newcomb & Dist/Geel City U17')), 'Away');
  assert.equal(groups.clubVenueRole(fixture('d', null, 'Newcomb & District 3rds', 'Newcomb & District 4ths')), null, 'intra-club game: no guess');
  assert.equal(groups.clubVenueRole(fixture('e', null, 'Lara', 'Teesdale')), null, 'no club side: no badge');
  const team = { id: 't3', name: 'Newcomb & District 4ths' };
  assert.equal(groups.clubVenueRole(fixture('f', null, 'Newcomb & District 3rds', 'Newcomb & District 4ths'), team), 'Away', 'a named team decides intra-club games');
});

const render = (element) => { let tree; act(() => { tree = create(element); }); return tree; };
const textOf = (node) => typeof node === 'string' ? node : node.children.map(textOf).join('');

test('rendered day groups: first days open, rest in a native <details>, no repeated date', () => {
  const rows = [
    fixture('a', '2026-10-10', 'Newcomb & District 1sts', 'Teesdale 1st XI'),
    fixture('b', '2026-10-10', 'Teesdale 2nd XI', 'Newcomb & District 2nds'),
    fixture('c', '2026-10-17T02:30:00Z', 'Newcomb & District Women 1sts', 'Murgheboluc'),
    fixture('d', '2026-10-17', 'Lara', 'Newcomb & District 1sts'),
    fixture('e', '2026-10-24', 'Newcomb & District 1sts', 'Bell Park'),
    fixture('f', '2026-10-31', 'Newcomb & District 1sts', 'Torquay'),
    fixture('g', '2026-11-07', 'Anglesea', 'Newcomb & District 1sts'),
  ];
  const tree = render(React.createElement(FixtureDayGroups, { fixtures: rows, label: 'Upcoming fixtures' }));
  const details = tree.root.findAllByType('details');
  assert.equal(details.length, 1, 'one Show more control');
  const sections = tree.root.findAllByType('section');
  const inside = new Set(details[0].findAllByType('section'));
  eq(sections.map((section) => inside.has(section)), [false, false, false, true, true], 'three days open, two behind Show more');
  const summary = textOf(details[0].findByType('summary'));
  assert.match(summary, /Show more fixtures/);
  assert.match(summary, /2 more across 2 match days/);
  assert.equal(tree.root.findAllByType('li').length, rows.length, 'every game stays in the HTML');
  // Dates only in headings, as <time>; rows carry no date.
  for (const li of tree.root.findAllByType('li')) {
    assert.equal(li.findAllByType('time').length, 0, 'no date inside a row');
    assert.doesNotMatch(textOf(li), /Oct 2026|Nov 2026/, 'no date text inside a row');
  }
  eq(tree.root.findAllByType('h3').map((h) => h.findByType('time').props.dateTime), ['2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07']);
  // TBC: once for all-TBC days, per row in the mixed day.
  const text = textOf(tree.root);
  const sectionText = sections.map(textOf);
  assert.equal((sectionText[0].match(/Start time TBC/g) || []).length, 1, 'said once for an all-TBC day');
  assert.doesNotMatch(sectionText[1].split('Sat 17 Oct 2026')[1].slice(0, 20), /Start time TBC/, 'mixed day heading does not claim TBC');
  assert.equal((sectionText[1].match(/Start time TBC/g) || []).length, 1, 'mixed day: TBC only on the untimed row');
  assert.match(sectionText[1], /1:30 pm/);
  assert.ok(!/Start time to be confirmed/.test(text), 'old per-card wording retired');
  // Badges.
  const badges = tree.root.findAllByType('li').map((li) => (textOf(li).match(/(Home|Away) game for Newcomb and District/) || [])[1] || null);
  eq(badges, ['Home', 'Away', 'Home', 'Away', 'Home', 'Home', 'Away']);
  // Results label and count.
  const results = render(React.createElement(FixtureDayGroups, { fixtures: rows.slice(0, 4), label: 'Recent results', expandedGroups: 1, moreLabel: 'results' }));
  assert.match(textOf(results.root.findByType('summary')), /Show more results.*2 more on 1 match day/s);
  const played = render(React.createElement(FixtureDayGroups, { fixtures: rows.slice(0, 4), label: 'Recent results', showTimeTbc: false }));
  assert.doesNotMatch(textOf(played.root), /Start time TBC/, 'results never say a start time is to be confirmed');
  assert.match(textOf(played.root), /1:30 pm/, 'results still show a known time');
  // Few days: no Show more at all.
  assert.equal(render(React.createElement(FixtureDayGroups, { fixtures: rows.slice(0, 2), label: 'Upcoming fixtures' })).root.findAllByType('details').length, 0);
});

test('team lists keep their date column and show the team badge', () => {
  const team = { id: 't1', name: 'Newcomb & District 1sts' };
  const tree = render(React.createElement(FixtureList, { fixtures: [fixture('a', '2026-10-10', 'Newcomb & District 1sts', 'Teesdale 1st XI'), fixture('d', '2026-10-17', 'Lara', 'Newcomb & District 1sts')], team, label: '1sts upcoming' }));
  const rows = tree.root.findAllByType('li').map(textOf);
  assert.match(rows[0], /^Sat 10 Oct 2026Start time TBCv Teesdale 1st XIHome game/);
  assert.match(rows[1], /v LaraAway game/);
});

test('page wiring and caching unchanged', () => {
  const page = fs.readFileSync('app/fixtures/page.tsx', 'utf8');
  assert.match(page, /export const dynamic = 'force-static';/);
  assert.match(page, /export const revalidate = 60;/);
  assert.match(page, /<FixtureDayGroups fixtures=\{upcoming\} label="Upcoming fixtures" \/>/);
  assert.match(page, /<FixtureDayGroups fixtures=\{results\.slice\(0, 12\)\} label="Recent results" expandedGroups=\{2\} moreLabel="results" showTimeTbc=\{false\} \/>/);
  const tables = fs.readFileSync('app/fixtures/_components/PlayHQTables.tsx', 'utf8');
  assert.match(tables, /from '@\/lib\/playhq\/fixture-groups'/, 'components use the tested helper');
  assert.doesNotMatch(tables, /'use client'/, 'fixture lists stay server-rendered');
});

test('intro caption clears the drawn cricket ball', () => {
  const css = fs.readFileSync('app/globals.css', 'utf8');
  const media = css.match(/@utility nd-hero-media \{([\s\S]*?)\n\}/)?.[1] || '';
  const ball = css.match(/@utility nd-hero-ball \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(media, /--nd-ball-size: clamp\(88px, 10vw, 132px\);/);
  assert.match(media, /--nd-ball-left: clamp\(-44px, -3vw, -14px\);/);
  assert.match(media, /& figcaption \{\s*padding-left: max\(1rem, calc\(var\(--nd-ball-size\) \+ var\(--nd-ball-left\) \+ 0\.75rem\)\);/, 'caption starts past the ball footprint');
  assert.match(ball, /width: var\(--nd-ball-size/, 'ball and caption share one footprint');
  assert.match(ball, /left: var\(--nd-ball-left/);
  const home = fs.readFileSync('app/page.tsx', 'utf8');
  assert.match(home, /<div className="nd-hero-media">[\s\S]*<ClubIntro \/>[\s\S]*<CricketBall className="nd-hero-ball" \/>/, 'the ball stays beside the intro');
  assert.match(fs.readFileSync('components/home/ClubIntro.tsx', 'utf8'), /<figcaption[\s\S]*>DINOS</, 'caption label kept');
});

console.log(`PASS: fixtures layout (${passed} checks)`);
