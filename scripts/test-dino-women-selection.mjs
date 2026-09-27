import assert from 'node:assert/strict';
import { womenSelectionStatus } from '../lib/dino-coach/women-selection.ts';

const players = [{ id: 'w1', women_eligible: true }, { id: 'w2', women_eligible: true }, { id: 'other', women_eligible: false }, { id: 'unreviewed', women_eligible: null }];
const pick = (playerId, positionType = 'starter') => ({ playerId, positionType });
assert.equal(womenSelectionStatus([], players, false).valid, true, 'Other seasons retain their existing rules');
assert.equal(womenSelectionStatus([], players, true).errors.length, 2);
assert.equal(womenSelectionStatus([pick('w1')], players, true).valid, false);
assert.equal(womenSelectionStatus([pick('w1'), pick('w1', 'bench')], players, true).squadCount, 1, 'Duplicate IDs cannot satisfy the minimum');
assert.equal(womenSelectionStatus([pick('w1', 'bench'), pick('w2', 'bench')], players, true).valid, false, 'Two bench women still need a starter');
assert.equal(womenSelectionStatus([pick('w1'), pick('w2', 'bench')], players, true).valid, true);
assert.equal(womenSelectionStatus([pick('w1'), pick('w2')], players, true).valid, true);
assert.equal(womenSelectionStatus([pick('w1'), pick('unreviewed'), pick('unknown')], players, true).valid, false, 'Unreviewed and missing players never count');
assert.equal(womenSelectionStatus([pick('w1'), pick('other', 'bench')], players, true).valid, false, 'Replacing one of the two women breaks the minimum');
assert.equal(womenSelectionStatus([pick('w1'), pick('w2', 'bench')], players.map(p => ({ ...p, team_label: 'Mens 4th', role: 'BOWL' })), true).valid, true, 'Grade and cricket role do not override confirmed eligibility');
console.log('PASS women selection: zero/one/two, starters, bench, duplicate IDs, unknown eligibility, swaps and season controls');
