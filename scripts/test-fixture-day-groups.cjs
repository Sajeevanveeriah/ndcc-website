// /fixtures "All teams": every NDCC game listed once, under one heading per
// Melbourne match day, in the order given (upcoming soonest first, results
// latest first). Renders the real component with sample PlayHQ fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const render = element => { let tree; act(() => { tree = create(element); }); return tree; };

const cache = new Map();
function load(file) {
  const resolved = ['', '.tsx', '.ts'].map(ext => file + ext).find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!resolved) throw new Error(`Cannot resolve ${file}`);
  if (cache.has(resolved)) return cache.get(resolved);
  const exports = {}; cache.set(resolved, exports);
  const code = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, module: { exports }, console, Intl, Date, require(name) {
    if (name.startsWith('@/')) return load(path.resolve(name.slice(2)));
    if (name.startsWith('.')) return load(path.resolve(path.dirname(resolved), name));
    return require(name);
  } }, { filename: resolved });
  return exports;
}

const { FixtureDayGroups } = load(path.resolve('app/fixtures/_components/PlayHQTables'));
const fixture = (id, startsAt, home, away, grade) => ({ id, startsAt, homeTeam: home, awayTeam: away, gradeName: grade, gradeId: grade, venue: 'Grinter Reserve', status: 'UPCOMING', playHQUrl: `https://www.playhq.com/game/${id}`, homeScore: null, awayScore: null });
const fixtures = [
  // Saturday 3 Oct, 12:30 pm and 1:00 pm Melbourne (UTC+10): same day group.
  fixture('a', '2026-10-03T02:30:00Z', 'Newcomb 1st XI', 'Guild St Marys', 'GCA 4 1st XI'),
  fixture('b', '2026-10-03T03:00:00Z', 'Guild St Marys 2nd XI', 'Newcomb 2nd XI', 'GCA 4 2nd XI'),
  // Sunday 11 Oct: a new group.
  fixture('c', '2026-10-11T00:00:00Z', 'Newcomb Women 1sts', 'Murgheboluc', 'Senior Women E Grade'),
  // 11:30 pm UTC on 10 Oct is Sunday 11 Oct in Melbourne: joins the Sunday group.
  fixture('d', '2026-10-10T23:30:00Z', 'Newcomb Women 2nds', 'Newtown & Chilwell', 'Senior Women H Grade'),
  fixture('e', null, 'Newcomb 3rd XI', 'TBC', 'Hard wicket'),
];
const tree = render(React.createElement(FixtureDayGroups, { fixtures, label: 'Upcoming fixtures' }));
const headings = tree.root.findAllByType('h3').map(node => node.children.join(''));
assert.deepEqual(headings, ['Sat 3 Oct 2026', 'Sun 11 Oct 2026', 'Date to be confirmed'], 'one heading per Melbourne match day, in order');
const lists = tree.root.findAllByType('ol');
assert.deepEqual(lists.map(list => list.findAllByType('li').length), [2, 2, 1], 'each game appears once, under its day');
const allRows = lists.flatMap(list => list.findAllByType('li'));
assert.equal(allRows.length, fixtures.length, 'no game is repeated');
assert.ok(lists.every(list => /^Upcoming fixtures: /.test(list.props['aria-label'])), 'each day list has an accessible name');
const ids = tree.root.findAllByType('h3').map(node => node.props.id);
assert.equal(new Set(ids).size, ids.length, 'heading ids are unique');
assert.ok(tree.root.findAllByType('section').every((section, index) => section.props['aria-labelledby'] === ids[index]), 'sections are labelled by their day');
assert.ok(JSON.stringify(tree.toJSON()).includes('GCA 4 2nd XI'), 'grade shown on each row');
assert.equal(render(React.createElement(FixtureDayGroups, { fixtures: [], label: 'Recent results', headingLevel: 2 })).root.findAllByType('h2').length, 0);

const page = fs.readFileSync('app/fixtures/page.tsx', 'utf8');
assert.match(page, /<FixtureDayGroups fixtures=\{upcoming\} label="Upcoming fixtures" \/>/);
assert.match(page, /<FixtureDayGroups fixtures=\{results\.slice\(0, 12\)\} label="Recent results" \/>/);
assert.doesNotMatch(page, /function FixtureCard/, 'the per-grade card grid is retired');
console.log('PASS: fixtures grouped by Melbourne match day, each game listed once, labelled sections, undated games last.');
