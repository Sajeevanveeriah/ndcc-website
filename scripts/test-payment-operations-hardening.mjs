#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), 'utf8');
const manual = await import(pathToFileURL(path.join(repoRoot, 'lib/payments/manual-payment.ts')).href);
const matching = await import(pathToFileURL(path.join(repoRoot, 'lib/payments/matching.ts')).href);

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

console.log('Checks:');

test('manual AUD input becomes strict positive integer cents', () => {
  assert.equal(manual.parseAudInputToCents('1'), 100);
  assert.equal(manual.parseAudInputToCents('10.5'), 1050);
  assert.equal(manual.parseAudInputToCents('0.01'), 1);
  for (const invalid of ['', '0', '-1', '1.234', '1e3', '1,000.00', 'NaN', 'Infinity']) {
    assert.equal(manual.parseAudInputToCents(invalid), null, invalid);
  }
  assert.equal(manual.parsePositiveAudCents(1250), 1250);
  assert.equal(manual.parsePositiveAudCents(12.5), null);
  assert.equal(manual.parsePositiveAudCents('1250'), null);
});

test('manual operation IDs are UUIDs suitable for retry identity', () => {
  assert.equal(manual.isPaymentOperationUuid('11111111-1111-4111-8111-111111111111'), true);
  assert.equal(manual.isPaymentOperationUuid('not-an-operation-id'), false);
});

test('bank matching uses exact remaining balance, not original total', () => {
  const order = {
    id: 'order-1',
    balance_due: 40,
    payment_reference: 'NDCCMER-2026-000001',
    customer_name: 'Alex Smith',
    created_at: '2026-08-20T00:00:00.000Z',
  };
  const exact = {
    id: 'tx-1', amount: 40, transaction_reference: 'NDCCMER-2026-000001',
    payer_name: 'Alex Smith', transaction_date: '2026-08-21T00:00:00.000Z',
  };
  assert.equal(matching.isExactBalanceMatch(order, exact), true);
  assert.equal(matching.scoreOrderMatch(order, exact), 165);
  assert.equal(matching.isExactBalanceMatch(order, { ...exact, amount: 100 }), false);
  assert.equal(matching.scoreOrderMatch(order, { ...exact, amount: 100 }), 125);
  assert.equal(matching.isExactBalanceMatch(order, { ...exact, amount: 40.001 }), false);
});

const checkout = read('app/api/payments/checkout-session/route.ts');
const manualRoute = read('app/api/admin/orders/payments/route.ts');
const manualUi = read('app/admin/orders/page.tsx');
const reconcile = read('app/api/admin/payments/reconcile/route.ts');
const ambiguous = read('app/api/admin/payments/ambiguous/route.ts');
const migration = read('supabase/migrations/20260830010000_payment_reference_integrity.sql');
const financialMigration = read('supabase/migrations/20260830015000_stripe_financial_event_integrity.sql');
const notifications = read('lib/order-notification-content.ts');
const receipts = read('lib/payment-receipts.ts');

test('generic checkout bounds JSON and reconciles all linked pending Sessions', () => {
  assert.match(checkout, /readLimitedJsonObject\(request, 8 \* 1024\)/);
  assert.match(checkout, /rawBody\.error === 'Request body is too large\.' \? 413 : 400/);
  assert.match(checkout, /typeof body\.amount !== 'number'/);
  assert.doesNotMatch(checkout, /Number\(body\.amount\)/);
  assert.match(checkout, /for \(const attempt of previousAttempts \|\| \[\]\)/);
  assert.match(checkout, /checkout\.sessions[\s\S]*?\.retrieve\(attempt\.provider_reference\)/);
  assert.match(checkout, /existingSession\.status === 'expired'/);
  assert.match(checkout, /checkout_expires_at_unix/);
  assert.match(checkout, /checkout_expires_at:/);
  assert.match(checkout, /CHECKOUT_DURATION_SECONDS \+ UNLINKED_EXPIRY_GRACE_SECONDS/);
  assert.match(checkout, /LEGACY_UNLINKED_HOLD_MILLISECONDS = 2 \* 60 \* 60 \* 1000/);
  assert.match(checkout, /sessionMetadata\.payment_kind === paymentKind/);
  assert.match(checkout, /sessionMetadata\.checkout_contract_version === '1'/);
  assert.match(checkout, /existingSession\.client_reference_id === attempt\.payment_reference/);
  assert.match(checkout, /let settlementPending = false/);
  assert.ok(
    checkout.indexOf('if (settlementPending)') > checkout.indexOf('for (const attempt of previousAttempts || [])'),
    'completed-Session handling must happen after the reconciliation loop',
  );
  assert.doesNotMatch(checkout, /matchingAttempts\.find/);
});

test('Checkout never releases an unlinked reservation before confirmed Session expiry', () => {
  assert.match(
    checkout,
    /if \(returnedContractInvalid\) \{[\s\S]*?checkout\.sessions\.expire\(session\.id\)[\s\S]*?if \(expired\?\.status === 'expired'\) \{[\s\S]*?recorded_by: 'stripe-checkout-reference-check'/,
  );
  assert.match(
    checkout,
    /if \(session\.status === 'open' && !session\.url\) \{[\s\S]*?checkout\.sessions\.expire\(session\.id\)[\s\S]*?if \(expired\?\.status === 'expired'\) \{[\s\S]*?recorded_by: 'stripe-checkout-status-check'/,
  );
  assert.match(
    checkout,
    /if \(linkedPayment\.error[\s\S]*?if \(session\.status === 'open'\) \{[\s\S]*?checkout\.sessions\.expire\(session\.id\)[\s\S]*?if \(expired\?\.status === 'expired'\) \{[\s\S]*?recorded_by: 'stripe-checkout-link-failure'/,
  );
  assert.match(checkout, /if \(session\.status !== 'open' && session\.status !== 'complete'\)/);
  assert.doesNotMatch(checkout, /if \(session\.status !== 'open' \|\| !session\.url\) \{[\s\S]{0,300}?status: 'failed'/);
  assert.equal(
    (migration.match(/created_at \+ interval '1 hour 5 minutes'/g) || []).length,
    3,
    'every SQL cleanup path must retain at least the 60-minute Session lifetime plus buffer',
  );
});

test('manual route and UI use one atomic retry operation in integer cents', () => {
  assert.match(manualRoute, /parsePositiveAudCents\(body\.amount_cents\)/);
  assert.match(manualRoute, /isPaymentOperationUuid\(operationId\)/);
  assert.match(manualRoute, /rpc\('record_manual_order_payment'/);
  assert.match(manualUi, /parseAudInputToCents\(paymentForm\.amount\)/);
  assert.match(manualUi, /paymentOperationRef\.current\?\.signature === operationSignature/);
  assert.match(manualUi, /client_operation_id: operationId/);
  assert.match(manualUi, /amount_cents: amountCents/);
  assert.match(manualRoute, /target\.provider === 'stripe'/);
  assert.match(manualRoute, /Stripe payment attempts cannot be voided manually/);
  assert.match(manualRoute, /Stripe payments must be refunded in Stripe and confirmed by the signed webhook/);
  assert.match(manualRoute, /existingReversalError/);
  assert.match(manualRoute, /reversalOrderError \|\| !reversalOrder/);
  assert.doesNotMatch(manualRoute, /normalisePaymentReferenceCategory\(reversalOrder\?\.order_category\)/);
  assert.match(manualUi, /p\.status === 'settled' && p\.provider !== 'stripe'/);
  assert.match(manualRoute, /enqueuePaymentReceiptJob\(supabase, 'order_payment', data\.id\)/);
  assert.match(manualRoute, /attemptPaymentReceiptDelivery\(supabase, queuedReceipt\.jobId\)/);
});

test('manual RPC serialises retries and enforces the unreserved balance', () => {
  assert.match(migration, /add column if not exists client_operation_id uuid/);
  assert.match(migration, /order_payments_client_operation_unique/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /where id = target_order_id[\s\S]*?for update/);
  assert.match(migration, /where order_id = target_order\.id and status = 'pending'/);
  assert.match(migration, /Manual payment exceeds the unreserved order balance/);
  assert.match(migration, /target_received_at is not null[\s\S]*?existing_payment\.received_at is distinct from effective_received_at/);
  assert.match(migration, /new\.client_operation_id is distinct from old\.client_operation_id/);
  assert.match(migration, /new\.received_at is distinct from old\.received_at/);
  assert.match(migration, /new\.metadata ->> 'payment_intent' is distinct from old\.metadata ->> 'payment_intent'/);
  assert.match(financialMigration, /new\.client_operation_id is distinct from old\.client_operation_id/);
  assert.match(financialMigration, /new\.received_at is distinct from old\.received_at/);
});

test('import reconciliation requires exact balance and sends every mismatch to review', () => {
  assert.match(reconcile, /select\('id, balance_due, payment_reference, customer_name, created_at'\)/);
  assert.match(reconcile, /isExactBalanceMatch\(entry\.order, tx\)/);
  assert.match(reconcile, /ranked\.length === 1 && ranked\[0\]\.score >= 55/);
  assert.match(reconcile, /const markNeedsReview/);
  assert.match(reconcile, /else \{\s*await markNeedsReview\(tx\.id\)/);
  assert.match(reconcile, /if \(reviewUpdateFailures > 0\)/);
  assert.match(migration, /Imported transaction exceeds the unreserved order balance/);
  assert.match(migration, /imported payment cannot be recorded against a cancelled order/);
  assert.match(reconcile, /enqueuePaymentReceiptJob\(supabase, 'order_payment', payment\.payment_id\)/);
  assert.match(ambiguous, /attemptPaymentReceiptDelivery\(supabase, queuedReceipt\.jobId\)/);
  assert.match(reconcile, /sendPaidStaffOrderNotificationForPayment/);
  assert.match(ambiguous, /sendPaidStaffOrderNotificationForPayment/);
});

test('paid staff notices and receipts expose payment and order\/bank identities', () => {
  assert.match(notifications, />Payment reference</);
  assert.match(notifications, />Order \/ bank reference</);
  assert.match(receipts, /<strong>Payment reference:<\/strong>/);
  assert.match(receipts, /<strong>Order \/ bank reference:<\/strong>/);
  assert.match(receipts, /Bank statement reference/);
});

console.log(`\ntest-payment-operations-hardening: ${passed} tests passed`);
