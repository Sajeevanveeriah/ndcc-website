#!/usr/bin/env node
// Regression tests for the payment ledger migration
// (20260716050000_payment_ledger.sql) against a real local Postgres.
//
// Covers: part payments, derived payment_status/balance_due, duplicate
// webhook events (unique provider_event_id), overpayment -> needs_review,
// reversal/void corrections, history immutability, order-total lock after
// settlement, and ready_to_process transition.

import {
  createTestDatabase, dropTestDatabase, applyMigrations, psql, check, finish,
} from './lib/local-db.mjs';

const DB = 'ndcc_test_ledger';

createTestDatabase(DB);
psql(DB, `create table if not exists news (id uuid primary key default gen_random_uuid(), title text, content text)`);
applyMigrations(DB, [
  '20260401_custom_committee_auth.sql',
  '20260402_merch_windows.sql',
  '20260402_payment_reconciliation.sql',
  '20260716050000_payment_ledger.sql',
]);

console.log('Checks:');

// Seed one order: total A$100.00
const orderId = psql(DB, `
  insert into orders (customer_name, customer_email, items, total_amount, payment_status, order_category, payment_reference)
  values ('Test Customer', 'test@example.com', '[]'::jsonb, 100.00, 'pending_bank_transfer', 'merch', 'NDCC-TEST-0001')
  returning id`);

const orderState = () => {
  const row = psql(DB, `select payment_status, to_char(amount_paid,'FM990.00'), to_char(balance_due,'FM990.00'), order_status from orders where id = '${orderId}'`);
  const [payment_status, amount_paid, balance_due, order_status] = row.split('\t');
  return { payment_status, amount_paid, balance_due, order_status };
};

check('new order starts with zero paid / full balance', orderState().amount_paid === '0.00' && orderState().balance_due === '100.00');

// 1. Part payment via bank transfer
psql(DB, `insert into order_payments (order_id, amount, method, status, received_at, recorded_by)
  values ('${orderId}', 40.00, 'bank_transfer', 'settled', now(), 'test-admin')`);
let s = orderState();
check('A$40 settled -> part_paid, balance A$60', s.payment_status === 'part_paid' && s.amount_paid === '40.00' && s.balance_due === '60.00', JSON.stringify(s));
check('part-paid order NOT ready_to_process', s.order_status === 'submitted', s.order_status);

// 2. Stripe webhook settles the remainder — with a provider event id
psql(DB, `insert into order_payments (order_id, amount, method, provider, provider_reference, provider_event_id, status, received_at)
  values ('${orderId}', 60.00, 'stripe', 'stripe', 'cs_test_123', 'evt_test_0001', 'settled', now())`);
s = orderState();
check('balance settles -> paid, balance A$0', s.payment_status === 'paid' && s.balance_due === '0.00', JSON.stringify(s));
check('fully paid order transitions to ready_to_process', s.order_status === 'ready_to_process', s.order_status);

// 3. Duplicate webhook event must be rejected by the unique index
const dup = psql(DB, `insert into order_payments (order_id, amount, method, provider, provider_event_id, status)
  values ('${orderId}', 60.00, 'stripe', 'stripe', 'evt_test_0001', 'settled')`, { expectFailure: true });
check('duplicate provider_event_id rejected (webhook idempotency)', dup.failed === true && /duplicate key|order_payments_provider_event_unique/.test(dup.message), dup.message?.slice(0, 120));

// 4. Overpayment -> needs_review, never silently exceeding the total
psql(DB, `insert into order_payments (order_id, amount, method, provider_event_id, status)
  values ('${orderId}', 10.00, 'stripe', 'evt_test_0002', 'settled')`);
s = orderState();
check('overpayment -> needs_review', s.payment_status === 'needs_review', s.payment_status);
const review = psql(DB, `select needs_review_reason from orders where id = '${orderId}'`);
check('overpayment recorded in needs_review_reason', /exceed/.test(review), review);

// 5. Correction by reversing record (refund of the overpaid A$10)
const overpaidRowId = psql(DB, `select id from order_payments where provider_event_id = 'evt_test_0002'`);
psql(DB, `insert into order_payments (order_id, amount, method, status, reverses_payment_id, notes, received_at)
  values ('${orderId}', 10.00, 'stripe', 'refunded', '${overpaidRowId}', 'reversing accidental double charge', now())`);
s = orderState();
check('A$10 reversal restores paid state', s.payment_status === 'paid' && s.amount_paid === '100.00', JSON.stringify(s));

// 6. History is preserved: all rows still present
const rowCount = psql(DB, `select count(*) from order_payments where order_id = '${orderId}'`);
check('full payment history preserved (4 ledger rows)', rowCount === '4', rowCount);

// 7. Settled rows are immutable and undeletable
const mut = psql(DB, `update order_payments set amount = 1.00 where provider_event_id = 'evt_test_0001'`, { expectFailure: true });
check('settled row amount is immutable', mut.failed === true && /immutable/.test(mut.message), mut.message?.slice(0, 120));
const del = psql(DB, `delete from order_payments where provider_event_id = 'evt_test_0001'`, { expectFailure: true });
check('settled row cannot be deleted', del.failed === true && /cannot be deleted/.test(del.message), del.message?.slice(0, 120));

// 8. Order total is locked once a settled payment exists
const totalChange = psql(DB, `update orders set total_amount = 150.00 where id = '${orderId}'`, { expectFailure: true });
check('order total locked after settlement', totalChange.failed === true && /cannot be changed/.test(totalChange.message), totalChange.message?.slice(0, 120));

// 9. Ledger constraints: zero/negative amounts and foreign currency rejected
const zero = psql(DB, `insert into order_payments (order_id, amount, method, status) values ('${orderId}', 0, 'cash', 'pending')`, { expectFailure: true });
check('zero amount rejected', zero.failed === true);
const neg = psql(DB, `insert into order_payments (order_id, amount, method, status) values ('${orderId}', -5, 'cash', 'pending')`, { expectFailure: true });
check('negative amount rejected', neg.failed === true);
const usd = psql(DB, `insert into order_payments (order_id, amount, currency, method, status) values ('${orderId}', 5, 'USD', 'cash', 'pending')`, { expectFailure: true });
check('non-AUD currency rejected', usd.failed === true);
const badMethod = psql(DB, `insert into order_payments (order_id, amount, method, status) values ('${orderId}', 5, 'cheque', 'pending')`, { expectFailure: true });
check('unsupported method rejected', badMethod.failed === true);

// 10. Pending rows may be voided (no totals impact) and deleted
psql(DB, `insert into order_payments (order_id, amount, method, status, provider_event_id) values ('${orderId}', 5.00, 'cash', 'pending', null)`);
s = orderState();
check('pending payment does not change totals', s.amount_paid === '100.00' && s.payment_status === 'paid', JSON.stringify(s));
psql(DB, `update order_payments set status = 'void' where order_id = '${orderId}' and status = 'pending'`);
s = orderState();
check('voided payment does not change totals', s.amount_paid === '100.00' && s.payment_status === 'paid', JSON.stringify(s));

// 11. Full refund path on a second order
const order2 = psql(DB, `
  insert into orders (customer_name, customer_email, items, total_amount, payment_status, order_category, payment_reference)
  values ('Refund Case', 'refund@example.com', '[]'::jsonb, 50.00, 'pending_bank_transfer', 'merch', 'NDCC-TEST-0002')
  returning id`);
psql(DB, `insert into order_payments (order_id, amount, method, status, received_at) values ('${order2}', 50.00, 'bank_transfer', 'settled', now())`);
psql(DB, `insert into order_payments (order_id, amount, method, status, received_at) values ('${order2}', 50.00, 'bank_transfer', 'refunded', now())`);
const s2 = psql(DB, `select payment_status, to_char(amount_paid,'FM990.00') from orders where id = '${order2}'`).split('\t');
check('full refund -> refunded, amount_paid A$0', s2[0] === 'refunded' && s2[1] === '0.00', JSON.stringify(s2));

// 12. Partial refund path
const order3 = psql(DB, `
  insert into orders (customer_name, customer_email, items, total_amount, payment_status, order_category, payment_reference)
  values ('Partial Refund', 'pr@example.com', '[]'::jsonb, 80.00, 'pending_bank_transfer', 'merch', 'NDCC-TEST-0003')
  returning id`);
psql(DB, `insert into order_payments (order_id, amount, method, status, received_at) values ('${order3}', 80.00, 'bank_transfer', 'settled', now())`);
psql(DB, `insert into order_payments (order_id, amount, method, status, received_at) values ('${order3}', 30.00, 'bank_transfer', 'refunded', now())`);
const s3 = psql(DB, `select payment_status, to_char(amount_paid,'FM990.00') from orders where id = '${order3}'`).split('\t');
check('partial refund -> partially_refunded, amount_paid A$50', s3[0] === 'partially_refunded' && s3[1] === '50.00', JSON.stringify(s3));

// 13. Orders with settled payments cannot be hard-deleted (FK restrict)
const delOrder = psql(DB, `delete from orders where id = '${orderId}'`, { expectFailure: true });
check('order with payment history cannot be hard-deleted', delOrder.failed === true && /foreign key|restrict/i.test(delOrder.message), delOrder.message?.slice(0, 120));

// 14. Payment settings singleton
const settings = psql(DB, `select bank_transfer_enabled, card_checkout_enabled, partial_payments_enabled, to_char(minimum_partial_amount,'FM990.00') from merch_payment_settings`);
check('merch_payment_settings singleton seeded with safe defaults', settings === 't\tf\tf\t10.00', settings);
const second = psql(DB, `insert into merch_payment_settings (id) values (false)`, { expectFailure: true });
check('second settings row rejected', second.failed === true);

dropTestDatabase(DB);
finish('test-payments-ledger');
