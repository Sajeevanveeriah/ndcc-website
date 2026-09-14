import assert from 'node:assert/strict';
import {
  isMealCollectionWindow,
  mealCollectionLabel,
  MEAL_COLLECTION_WINDOWS,
  MEAL_COLLECTION_REQUIRED_MESSAGE,
  MEAL_COLLECTION_TIME_ZONE,
} from '../lib/meal-collection.ts';

for (const value of ['juniors', 'seniors']) {
  assert.equal(isMealCollectionWindow(value), true);
}
for (const value of [undefined, null, '', 'Juniors', ' juniors', 'seniors ', '18:00',
  '19:30', 'junior', 'invalid', 0, 1, true, false, [], ['juniors'],
  ['juniors', 'seniors'], {}, { value: 'seniors' }, '__proto__']) {
  assert.equal(isMealCollectionWindow(value), false, `Rejected ${JSON.stringify(value)}`);
  assert.equal(mealCollectionLabel(value), 'Collection time not recorded');
}
assert.deepEqual(MEAL_COLLECTION_WINDOWS.map(({ label }) => label), [
  'Juniors - 6:00 pm', 'Seniors - 7:30 pm',
]);
assert.equal(mealCollectionLabel('juniors'), 'Juniors - 6:00 pm');
assert.equal(mealCollectionLabel('seniors'), 'Seniors - 7:30 pm');
assert.equal(MEAL_COLLECTION_TIME_ZONE, 'Australia/Melbourne');
assert.equal(MEAL_COLLECTION_REQUIRED_MESSAGE,
  'Please choose a meal collection time before continuing to payment.');
console.log('PASS: both valid windows, 21 invalid values, historical fallback and exact labels.');
