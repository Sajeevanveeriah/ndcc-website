// Men's / women's / junior classification used by the home page next-matches
// board and the /fixtures category filter (lib/playhq/team-category.ts).
import assert from 'node:assert/strict';
import { groupByCategory, juniorAge, teamCategory, TEAM_CATEGORY_LABELS } from '../lib/playhq/team-category.ts';

// Recorded live PlayHQ teams (production feed, 28 September 2026).
assert.equal(teamCategory('Newcomb & District 1sts', 'GCA 4 1st XI'), 'men');
assert.equal(teamCategory('Newcomb & District 5ths', null), 'men');
assert.equal(teamCategory('Newcomb & District Women 1sts', 'Senior Women E Grade'), 'women');
assert.equal(teamCategory('Newcomb & District Women 2nds', 'Senior Women H Grade'), 'women');
// CMS junior team cards (production teams table, 28 September 2026).
assert.equal(teamCategory('Junior Boys - Under 11s', 'GCA Junior Competition'), 'junior');
assert.equal(teamCategory('Junior Boys - Under 17s'), 'junior');
// Typical PlayHQ junior naming: junior wins over women for girls' teams.
assert.equal(teamCategory('Newcomb & District U13'), 'junior');
assert.equal(teamCategory('Newcomb & District U15 Girls'), 'junior');
assert.equal(teamCategory('Newcomb & District 1sts', 'Under 16 Boys'), 'junior');
assert.equal(teamCategory('Newcomb & District', 'Geelong Cricket Association Girls League'), 'junior');
assert.equal(teamCategory("Newcomb & District Ladies"), 'women');
assert.equal(teamCategory(''), 'men');

assert.equal(juniorAge('Junior Boys - Under 13s'), 13);
assert.equal(juniorAge('Newcomb & District U17'), 17);
assert.equal(juniorAge('U-11 Blue'), 11);
assert.equal(juniorAge('Newcomb & District 1sts'), null);
assert.equal(juniorAge(null), null);

const groups = groupByCategory(['Junior Boys - Under 13s', 'Newcomb & District 2nds', 'Newcomb & District Women 1sts'], (name) => teamCategory(name));
assert.deepEqual(groups.map((group) => [group.label, group.items]), [
  ["Men's", ['Newcomb & District 2nds']],
  ["Women's", ['Newcomb & District Women 1sts']],
  ['Juniors', ['Junior Boys - Under 13s']],
]);
assert.deepEqual(Object.values(TEAM_CATEGORY_LABELS), ["Men's", "Women's", 'Juniors']);
console.log('Team category: men, women and junior classification, age groups and grouping order passed.');
