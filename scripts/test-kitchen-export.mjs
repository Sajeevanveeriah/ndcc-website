import assert from 'node:assert/strict';
import { isThursdayServiceDate, csvCell, kitchenOrdersCsv, kitchenPaymentMethod, kitchenAmountDue } from '../lib/kitchen-export.ts';

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
// Pay cash at the bar: listed with the amount to collect on the order's first row only.
const header = kitchenOrdersCsv([]).split('\r\n')[0];
for (const column of ['Payment method', 'Order total', 'Collect at bar']) assert.ok(header.includes(column), column);
const bar = { ...base, meal_collection_window: 'seniors', total_amount: 24, amount_paid: 0, balance_due: 24, bar_payment_selected_at: '2026-09-17T05:00:00Z', bank_transfer_selected_at: null };
const barRows = kitchenOrdersCsv([bar]).split('\r\n');
assert.ok(barRows[1].endsWith('"pending_bank_transfer","Pay cash at the bar","24.00","24.00"'), barRows[1]);
assert.ok(barRows[2].endsWith('"pending_bank_transfer","Pay cash at the bar","",""'), 'money only on the first row');
assert.equal(kitchenPaymentMethod({ ...bar, payment_status: 'paid' }), 'Paid', 'settled status wins over intent');
assert.equal(kitchenAmountDue({ ...bar, payment_status: 'paid' }), 0);
assert.equal(kitchenAmountDue({ ...bar, balance_due: null, amount_paid: 10 }), 14, 'falls back to total less paid');
assert.equal(kitchenPaymentMethod({ ...bar, bar_payment_selected_at: null, bank_transfer_selected_at: '2026-09-17T05:00:00Z' }), 'Bank transfer - awaiting receipt');
assert.equal(kitchenPaymentMethod({ ...bar, bar_payment_selected_at: null }), 'Not yet paid');
const bank = kitchenOrdersCsv([{ ...bar, bar_payment_selected_at: null, bank_transfer_selected_at: '2026-09-17T05:00:00Z' }]).split('\r\n')[1];
assert.ok(bank.endsWith('"Bank transfer - awaiting receipt","24.00",""'), 'only bar orders carry an amount to collect');
console.log('PASS: Thursday validation, CSV escaping, formula protection, both windows, historical null, item quantities, pay-at-bar columns and empty export.');
