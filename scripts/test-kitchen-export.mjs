import assert from 'node:assert/strict';
import { isThursdayServiceDate, csvCell, kitchenOrdersCsv } from '../lib/kitchen-export.ts';

assert.equal(isThursdayServiceDate('2026-09-17'), true);
for (const date of ['', '2026-09-16', '2026-02-30', '2026-09-17x']) assert.equal(isThursdayServiceDate(date), false);
assert.equal(csvCell('Smith, "Sam"'), '"Smith, ""Sam"""');
for (const text of ['=1+1', '+SUM(A1)', '-1+1', '@SUM(A1)', '\t=1+1', ' =1+1']) assert.ok(csvCell(text).startsWith('"\''));
const base = { customer_name: 'Sam', payment_reference: 'NDCCKIT-2026-000001', meal_service_date: '2026-09-17', payment_status: 'pending_bank_transfer', items: [{ name: 'Roast', quantity: 2 }, { name: 'Pasta', quantity: 1 }] };
for (const [window, label] of [['juniors', 'Juniors - 6:00 pm'], ['seniors', 'Seniors - 7:30 pm'], [null, 'Collection time not recorded']]) {
  const csv = kitchenOrdersCsv([{ ...base, meal_collection_window: window }]);
  assert.equal(csv.split('\r\n').length, 4);
  assert.ok(csv.includes(label));
  assert.ok(csv.includes('"Roast","2"'));
  assert.ok(csv.includes('"Sam"'));
}
assert.ok(kitchenOrdersCsv([]).includes('Purchaser name'));
console.log('PASS: Thursday validation, CSV escaping, formula protection, both windows, historical null, item quantities and empty export.');
