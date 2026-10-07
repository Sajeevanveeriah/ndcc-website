// Packed-date kitchen menu names read as a date on the public page.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicKitchenMenuName } from '../lib/kitchen-menu-name.ts';

assert.equal(publicKitchenMenuName('Meals 08102026'), 'Meals for Thursday 8 October 2026');
assert.equal(publicKitchenMenuName('Meals_24102026'), 'Meals for Saturday 24 October 2026');
assert.equal(publicKitchenMenuName('08102026'), 'Thursday 8 October 2026');
assert.equal(publicKitchenMenuName('Meals 31022026'), 'Meals 31022026', 'impossible dates are left as entered');
assert.equal(publicKitchenMenuName('Kitchen Menu'), 'Kitchen Menu');
assert.equal(publicKitchenMenuName('  Friday Specials  '), 'Friday Specials');
assert.match(readFileSync('app/kitchen/KitchenClient.tsx', 'utf8'), /\{publicKitchenMenuName\(menuName\)\}/);

console.log('PASS: kitchen menu names with a packed date read as a date.');
