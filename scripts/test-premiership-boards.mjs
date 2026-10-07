// The About honour board shows every premiership it counts: senior XIs first,
// then any other team label in the honour roll (U13 Juniors was counted but hidden).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const about = readFileSync('app/about/page.tsx', 'utf8');
assert.match(about, /const premiershipBoards = \[\s*\.\.\.premiershipTeams,\s*\.\.\.new Set\(premierships\.map\(\(item\) => item\.team_label\)\.filter\(\(label\) => !premiershipTeams\.includes\(label\)\)\),\s*\];/);
assert.match(about, /\{premiershipBoards\.map\(\(teamLabel\) =>/);
assert.doesNotMatch(about, /\{premiershipTeams\.map\(/, 'boards are not limited to the senior XIs');
console.log('PASS: every counted premiership has an honour board.');
