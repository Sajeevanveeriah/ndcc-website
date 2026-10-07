// /teams category filter (app/teams/TeamsFilter.tsx): option list, group
// visibility and the server-rendered markup (all groups visible, accessible
// toggle buttons), plus the page wiring that feeds it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const repoRoot = path.resolve(__dirname, '..');
function load(file) {
  const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    module, exports: module.exports, console,
    require(name) {
      if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
      return require(name);
    },
  }, { filename: file });
  return module.exports;
}

const filter = load('app/teams/TeamsFilter.tsx');
const { isTeamGroupVisible } = filter;
// Results come from the vm realm; compare them as plain data.
const teamFilterOptions = (groups) => JSON.parse(JSON.stringify(filter.teamFilterOptions(groups)));
const TeamsFilter = filter.default;

// 1. Options: "All teams" first, then only categories that have teams, in order.
assert.deepEqual(
  teamFilterOptions([{ category: 'men', count: 5 }, { category: 'women', count: 2 }, { category: 'junior', count: 3 }]),
  [{ value: 'all', label: 'All teams' }, { value: 'men', label: "Men's" }, { value: 'women', label: "Women's" }, { value: 'junior', label: 'Juniors' }],
);
assert.deepEqual(
  teamFilterOptions([{ category: 'men', count: 2 }, { category: 'women', count: 0 }, { category: 'junior', count: 1 }]).map((option) => option.value),
  ['all', 'men', 'junior'],
  'empty categories get no filter button',
);
assert.deepEqual(teamFilterOptions([]).map((option) => option.value), ['all']);

// 2. Visibility: "all" shows every group, a category shows only itself.
for (const category of ['men', 'women', 'junior']) assert.equal(isTeamGroupVisible('all', category), true);
assert.equal(isTeamGroupVisible('men', 'men'), true);
assert.equal(isTeamGroupVisible('men', 'women'), false);
assert.equal(isTeamGroupVisible('women', 'junior'), false);
assert.equal(isTeamGroupVisible('junior', 'junior'), true);

// 3. Server render: every populated group is in the HTML and none is hidden,
// the filter is a labelled group of toggle buttons with "All teams" pressed.
const group = (category, heading, count) => ({ category, heading, count, content: React.createElement('ul', null, React.createElement('li', null, `${heading} card`)) });
const html = renderToStaticMarkup(React.createElement(TeamsFilter, { groups: [group('men', 'Senior men', 5), group('women', 'Senior women', 2), group('junior', 'Juniors', 3)] }));
assert.match(html, /class="nd-seg" role="group" aria-label="Filter teams by category"/);
assert.equal((html.match(/<button /g) || []).length, 4);
assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
assert.match(html, /<button type="button" aria-pressed="true" aria-controls="team-groups">All teams<\/button>/);
assert.match(html, /id="team-groups"/);
assert.ok(!/\shidden(=|\s|>)/.test(html), 'no group is hidden before the visitor filters');
for (const heading of ['Senior men', 'Senior women', 'Juniors']) {
  assert.ok(html.includes(`>${heading}</h2>`), `${heading} heading rendered`);
  assert.ok(html.includes(`${heading} card`), `${heading} cards rendered`);
}
assert.match(html, /<section aria-labelledby="team-group-men"><h2 id="team-group-men" class="nd-month">Senior men<\/h2>/);

// 4. Empty groups are not rendered; a single category gets no filter at all.
const single = renderToStaticMarkup(React.createElement(TeamsFilter, { groups: [group('men', 'Senior men', 3), group('women', 'Senior women', 0), group('junior', 'Juniors', 0)] }));
assert.ok(!single.includes('nd-seg'), 'one category: no filter control');
assert.ok(single.includes('Senior men') && !single.includes('Senior women') && !single.includes('Juniors'));

// 5. Page wiring: real data sources, same slug links and fixture logic as
// /teams/[slug], ISR unchanged.
const page = fs.readFileSync(path.join(repoRoot, 'app/teams/(list)/page.tsx'), 'utf8');
assert.match(page, /export const revalidate = 60;/);
assert.match(page, /export const dynamic = 'force-static';/);
assert.match(page, /await getPublicTeams\(\)/);
assert.match(page, /href=\{`\/teams\/\$\{slugs\.get\(team\)\}`\}/);
assert.match(page, /<TeamsFilter groups=\{groups\} \/>/);
for (const helper of ['matchPlayHQTeam', 'fixturesForTeam', 'splitTeamFixtures', 'opponentFor', 'teamCategory']) assert.ok(page.includes(`${helper}(`), `${helper} used`);

console.log('teams filter tests passed');
