#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isAuthorizedCronRequest } from '../lib/cron-auth.ts';
import { canRecordSimulatedReceiptDelivery } from '../lib/payments/receipt-delivery-policy.ts';

const root = path.resolve(import.meta.dirname, '..');
const [
  migration,
  processor,
  cronRoute,
  raffleEmail,
  dinoReceipt,
  orderReceipt,
  vercelRaw,
  envExample,
  readme,
  webhook,
  manualPaymentRoute,
  reconcileRoute,
  ambiguousRoute,
  financialMigration,
] = await Promise.all([
  readFile(path.join(root, 'supabase/migrations/20260830130840_payment_receipt_delivery_outbox.sql'), 'utf8'),
  readFile(path.join(root, 'lib/payments/receipt-delivery.ts'), 'utf8'),
  readFile(path.join(root, 'app/api/cron/payment-receipts/route.ts'), 'utf8'),
  readFile(path.join(root, 'lib/raffle-email.ts'), 'utf8'),
  readFile(path.join(root, 'lib/dino-coach/payment-receipt.ts'), 'utf8'),
  readFile(path.join(root, 'lib/payment-receipts.ts'), 'utf8'),
  readFile(path.join(root, 'vercel.json'), 'utf8'),
  readFile(path.join(root, '.env.example'), 'utf8'),
  readFile(path.join(root, 'README.md'), 'utf8'),
  readFile(path.join(root, 'app/api/stripe/webhook/route.ts'), 'utf8'),
  readFile(path.join(root, 'app/api/admin/orders/payments/route.ts'), 'utf8'),
  readFile(path.join(root, 'app/api/admin/payments/reconcile/route.ts'), 'utf8'),
  readFile(path.join(root, 'app/api/admin/payments/ambiguous/route.ts'), 'utf8'),
  readFile(path.join(root, 'supabase/migrations/20260830130824_stripe_financial_event_integrity.sql'), 'utf8'),
]);

let passed = 0;
function test(name, check) {
  check();
  passed += 1;
  console.log(`  ok - ${name}`);
}

console.log('Receipt-delivery outbox checks:');

test('cron authorization fails closed and uses an exact bearer token', () => {
  assert.equal(isAuthorizedCronRequest(null, undefined), false);
  assert.equal(isAuthorizedCronRequest('Bearer short', 'short'), false);
  assert.equal(isAuthorizedCronRequest('Bearer wrong', '0123456789abcdef'), false);
  assert.equal(isAuthorizedCronRequest('Bearer 0123456789abcdef', '0123456789abcdef'), true);
});

test('simulated email delivery cannot complete production work', () => {
  assert.equal(canRecordSimulatedReceiptDelivery({
    NODE_ENV: 'development', VERCEL_ENV: 'preview', EMAIL_TEST_MODE: 'true',
  }), true);
  assert.equal(canRecordSimulatedReceiptDelivery({
    NODE_ENV: 'production', VERCEL_ENV: 'production', EMAIL_TEST_MODE: 'true',
  }), false);
  assert.equal(canRecordSimulatedReceiptDelivery({
    NODE_ENV: 'production', VERCEL_ENV: undefined, EMAIL_TEST_MODE: 'true',
  }), false);
  assert.equal(canRecordSimulatedReceiptDelivery({
    NODE_ENV: 'development', VERCEL_ENV: 'preview', EMAIL_TEST_MODE: 'false',
  }), false);
});

test('outbox has one constrained source identity and no event identity', () => {
  const table = migration.match(/create table if not exists public\.receipt_delivery_jobs \([\s\S]*?\n\);/)?.[0] || '';
  assert.match(table, /num_nonnulls\(order_payment_id, raffle_order_id, dino_entry_id\) = 1/);
  assert.match(table, /unique \(order_payment_id\)/);
  assert.match(table, /unique \(raffle_order_id\)/);
  assert.match(table, /unique \(dino_entry_id\)/);
  assert.doesNotMatch(table, /event_id/i);
  assert.doesNotMatch(table, /customer_(name|email)|manager_(name|email)/i);
});

test('queue and terminal states enforce leases and delivered timestamps', () => {
  assert.match(migration, /'queued', 'processing', 'retry', 'delivered', 'cancelled', 'dead_letter'/);
  assert.match(migration, /status = 'processing'[\s\S]*locked_at is not null[\s\S]*lease_expires_at is not null[\s\S]*locked_by is not null/);
  assert.match(migration, /status <> 'processing'[\s\S]*locked_at is null[\s\S]*lease_expires_at is null[\s\S]*locked_by is null/);
  assert.match(migration, /status = 'delivered' and delivered_at is not null and next_attempt_at is null/);
  assert.match(migration, /status in \('queued', 'retry'\) and next_attempt_at is not null/);
});

test('new paid records enqueue in their payment transaction', () => {
  assert.match(migration, /order_payments_queue_receipt[\s\S]*after insert or update of status on public\.order_payments/);
  assert.match(migration, /raffle_orders_queue_receipt[\s\S]*after insert or update of status on public\.raffle_orders/);
  assert.match(migration, /fantasy_entries_queue_receipt[\s\S]*after insert or update of status on public\.fantasy_entries/);
  assert.match(migration, /enqueue_payment_receipt_job\([\s\S]*?'order_payment', new\.id/);
  assert.match(migration, /enqueue_payment_receipt_job\([\s\S]*?'raffle_order', new\.id/);
  assert.match(migration, /enqueue_payment_receipt_job\([\s\S]*?'dino_entry', new\.id/);
  assert.ok((migration.match(/make_interval\(mins => 5\)/g) || []).length >= 6);
});

test('migration does not unexpectedly backfill historical receipts', () => {
  assert.doesNotMatch(
    migration,
    /insert into public\.receipt_delivery_jobs\s*\([^)]*\)\s*select/i,
  );
  assert.match(migration, /do not bulk-enqueue historical settled records/i);
});

test('enqueue eligibility is derived from committed source state', () => {
  assert.match(migration, /order_payments[\s\S]*status = 'settled'/);
  assert.match(migration, /raffle_orders[\s\S]*status = 'paid'/);
  assert.match(migration, /fantasy_entries[\s\S]*status = 'paid'/);
  assert.match(migration, /on conflict \(order_payment_id\)/);
  assert.match(migration, /on conflict \(raffle_order_id\)/);
  assert.match(migration, /on conflict \(dino_entry_id\)/);
  assert.match(migration, /for update of payment/);
  assert.ok((migration.match(/payment_reference ~ '\^NDCCRAF-/g) || []).length >= 2);
  assert.ok((migration.match(/payment_reference ~ '\^NDCCDCO-/g) || []).length >= 2);
  assert.match(migration, /payment\.currency = 'AUD'/);
  assert.match(migration, /currency = 'aud'/);
});

test('global workers discover without row locks and delegate atomic targeted claims', () => {
  const globalClaim = migration.match(/create or replace function public\.claim_payment_receipt_jobs\([\s\S]*?revoke all on function public\.claim_payment_receipt_jobs/)?.[0] || '';
  const targetedClaim = migration.match(/create or replace function public\.claim_payment_receipt_job\([\s\S]*?revoke all on function public\.claim_payment_receipt_job/)?.[0] || '';
  assert.doesNotMatch(globalClaim, /for update|skip locked/);
  assert.match(globalClaim, /public\.claim_payment_receipt_job\(/);
  assert.match(globalClaim, /job\.status = 'processing'[\s\S]*job\.lease_expires_at <=/);
  assert.match(globalClaim, /order by coalesce\(job\.next_attempt_at, job\.lease_expires_at\), job\.created_at, job\.id[\s\S]*limit safe_scan_limit[\s\S]*order by due_job\.id/);
  assert.match(targetedClaim, /lease_expires_at = pg_catalog\.now\(\) \+ pg_catalog\.make_interval/);
  assert.match(targetedClaim, /attempts = job\.attempts \+ 1/);
  assert.match(targetedClaim, /job\.attempts < job\.max_attempts/);
  assert.match(targetedClaim, /exhausted\.attempts >= exhausted\.max_attempts/);
  assert.match(targetedClaim, /target_lease_seconds[\s\S]*60[\s\S]*900/);
  assert.doesNotMatch(migration, /pg_catalog\.(?:least|greatest)\(/);
});

test('Stripe-backed claims and preflight defer while financial replay is pending', () => {
  const globalClaim = migration.match(/create or replace function public\.claim_payment_receipt_jobs\([\s\S]*?revoke all on function public\.claim_payment_receipt_jobs/)?.[0] || '';
  const targetedClaim = migration.match(/create or replace function public\.claim_payment_receipt_job\([\s\S]*?revoke all on function public\.claim_payment_receipt_job/)?.[0] || '';
  const preflight = migration.match(/create or replace function public\.preflight_payment_receipt_job\([\s\S]*?revoke all on function public\.preflight_payment_receipt_job/)?.[0] || '';
  assert.match(globalClaim, /public\.claim_payment_receipt_job\(/);
  assert.match(targetedClaim, /job\.receipt_kind = 'order_payment'[\s\S]*payment\.metadata ->> 'payment_intent' = source_payment_intent/);
  assert.match(targetedClaim, /job\.receipt_kind = 'raffle_order'[\s\S]*source\.stripe_payment_intent_id = source_payment_intent/);
  assert.match(targetedClaim, /job\.receipt_kind = 'dino_entry'[\s\S]*source\.stripe_payment_intent_id = source_payment_intent/);
  assert.ok((targetedClaim.match(/pending_event\.payment_domain = 'pending'/g) || []).length >= 3);
  assert.match(preflight, /payment\.status = 'settled'/);
  assert.ok((preflight.match(/source\.status = 'paid'/g) || []).length >= 2);
  assert.match(preflight, /pending_event\.payment_intent_id = source_payment_intent[\s\S]*pending_event\.payment_domain = 'pending'/);
  for (const sender of [orderReceipt, raffleEmail, dinoReceipt]) {
    assert.match(sender, /\.from\('stripe_payment_events'\)/);
    assert.match(sender, /\.eq\('payment_domain', 'pending'\)/);
  }
  assert.match(orderReceipt, /payment\.method === 'stripe'[\s\S]*Stripe payment intent is missing or invalid/);
});

test('receipt authorization shares the PI advisory lock before row locks and rechecks under it', () => {
  const enqueue = migration.match(/create or replace function public\.enqueue_payment_receipt_job\([\s\S]*?revoke all on function public\.enqueue_payment_receipt_job/)?.[0] || '';
  const targeted = migration.match(/create or replace function public\.claim_payment_receipt_job\([\s\S]*?revoke all on function public\.claim_payment_receipt_job/)?.[0] || '';
  const globalClaim = migration.match(/create or replace function public\.claim_payment_receipt_jobs\([\s\S]*?revoke all on function public\.claim_payment_receipt_jobs/)?.[0] || '';
  const preflight = migration.match(/create or replace function public\.preflight_payment_receipt_job\([\s\S]*?revoke all on function public\.preflight_payment_receipt_job/)?.[0] || '';
  const exactLock = /pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\(source_payment_intent, 614749110\)\s*\)/g;

  assert.ok((enqueue.match(exactLock) || []).length >= 3);
  assert.ok((targeted.match(exactLock) || []).length >= 1);
  assert.ok((preflight.match(exactLock) || []).length >= 1);
  assert.match(financialMigration, /pg_catalog\.hashtextextended\(target_payment_intent_id, 614749110\)/);

  for (const branch of [
    enqueue.match(/if target_receipt_kind = 'order_payment'[\s\S]*?elsif target_receipt_kind = 'raffle_order'/)?.[0] || '',
    enqueue.match(/elsif target_receipt_kind = 'raffle_order'[\s\S]*?elsif target_receipt_kind = 'dino_entry'/)?.[0] || '',
    enqueue.match(/elsif target_receipt_kind = 'dino_entry'[\s\S]*?else\s+raise exception 'Unknown receipt-delivery kind.'/)?.[0] || '',
  ]) {
    assert.ok(branch.indexOf('into source_payment_intent') >= 0);
    assert.ok(branch.indexOf('into source_payment_intent') < branch.indexOf('pg_advisory_xact_lock'));
    assert.ok(branch.indexOf('pg_advisory_xact_lock') < branch.indexOf('for update'));
  }

  assert.ok(targeted.indexOf('into source_payment_intent') < targeted.indexOf('pg_advisory_xact_lock'));
  assert.ok(targeted.indexOf('pg_advisory_xact_lock') < targeted.indexOf('update public.receipt_delivery_jobs as exhausted'));
  assert.ok(targeted.indexOf('update public.receipt_delivery_jobs as exhausted') < targeted.indexOf("payment.status = 'settled'"));
  assert.match(targeted, /source\.status = 'paid'[\s\S]*source\.status = 'paid'/);
  assert.doesNotMatch(globalClaim, /for update|skip locked/);
  assert.match(globalClaim, /public\.claim_payment_receipt_job\(/);
  assert.match(globalClaim, /limit safe_scan_limit[\s\S]*order by due_job\.id[\s\S]*loop[\s\S]*public\.claim_payment_receipt_job/);

  assert.ok(preflight.indexOf('into source_payment_intent') < preflight.indexOf('pg_advisory_xact_lock'));
  assert.ok(preflight.indexOf('pg_advisory_xact_lock') < preflight.indexOf('select * into current_job'));
  assert.ok(preflight.indexOf('select * into current_job') < preflight.indexOf("payment.status = 'settled'"));
  assert.ok(preflight.indexOf("payment.status = 'settled'") < preflight.indexOf('select exists ('));
  assert.match(preflight, /current_job\.locked_by is distinct from target_worker_id[\s\S]*current_job\.lease_expires_at <= pg_catalog\.now\(\)/);
});

test('immediate delivery claims only the enqueued job', () => {
  const targeted = migration.match(/create or replace function public\.claim_payment_receipt_job\([\s\S]*?revoke all on function public\.claim_payment_receipt_job/)?.[0] || '';
  assert.match(targeted, /where job\.id = target_job_id/);
  assert.match(targeted, /target_worker_id/);
  assert.match(processor, /claim_payment_receipt_job/);
  assert.match(processor, /attemptPaymentReceiptDelivery/);
});

test('only the lease owner can finish a job', () => {
  assert.match(migration, /current_job\.locked_by is distinct from target_worker_id/);
  assert.match(migration, /Receipt-delivery lease does not belong to this worker/);
});

test('failures receive bounded exponential retry and a dead-letter state', () => {
  assert.match(migration, /current_job\.attempts >= current_job\.max_attempts/);
  assert.match(migration, /status = 'dead_letter'/);
  assert.match(migration, /pg_catalog\.power\(2::numeric/);
  assert.match(migration, /last_error = pg_catalog\.left\(/);
});

test('terminal jobs can only be explicitly requeued while eligible', () => {
  assert.match(migration, /requeue_payment_receipt_job/);
  assert.match(migration, /status not in \('dead_letter', 'cancelled'\)/);
  assert.match(migration, /Receipt source is not currently eligible for delivery/);
});

test('refund and dispute transitions cancel work that has not started', () => {
  assert.match(migration, /old\.status = 'paid' and new\.status <> 'paid'/);
  assert.match(migration, /where raffle_order_id = new\.id and status in \('queued', 'retry'\)/);
  assert.match(migration, /where dino_entry_id = new\.id and status in \('queued', 'retry'\)/);
});

test('outbox data and RPCs are service-role only', () => {
  assert.match(migration, /alter table public\.receipt_delivery_jobs enable row level security/);
  assert.match(migration, /revoke all on table public\.receipt_delivery_jobs from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.receipt_delivery_jobs to service_role/);
  for (const name of [
    'enqueue_payment_receipt_job',
    'claim_payment_receipt_jobs',
    'claim_payment_receipt_job',
    'preflight_payment_receipt_job',
    'finish_payment_receipt_job',
    'requeue_payment_receipt_job',
  ]) {
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}`));
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}[\\s\\S]*?from public, anon, authenticated`));
  }
});

test('all privileged functions pin an empty search path', () => {
  const definers = migration.match(/security definer/g) || [];
  const pinned = migration.match(/security definer\nset search_path = ''/g) || [];
  assert.ok(definers.length >= 9);
  assert.equal(pinned.length, definers.length);
});

test('processor dispatches all three receipt kinds and records completion', () => {
  assert.match(processor, /sendOrderPaymentReceiptForPayment/);
  assert.match(processor, /sendPaidRaffleEmails/);
  assert.match(processor, /sendDinoCoachPaymentReceiptForEntry/);
  assert.match(processor, /preflight_payment_receipt_job/);
  assert.ok(processor.indexOf('preflightClaimedJob') < processor.indexOf('await deliverJob'));
  assert.match(processor, /finish_payment_receipt_job/);
  assert.match(processor, /result\.status === 'already_sent'/);
  assert.match(processor, /result\.status === 'sent_unrecorded'/);
  assert.match(processor, /\{ issuedAt: job\.created_at \}/);
});

test('explicit enqueue releases the trigger safety hold for an immediate attempt', () => {
  assert.match(processor, /target_not_before: new Date\(\)\.toISOString\(\)/);
  assert.match(processor, /claim_payment_receipt_job/);
});

test('webhook, manual and import paths use the same durable two-call integration', () => {
  for (const route of [webhook, manualPaymentRoute, reconcileRoute, ambiguousRoute]) {
    assert.match(route, /enqueuePaymentReceiptJob/);
    assert.match(route, /attemptPaymentReceiptDelivery/);
    assert.doesNotMatch(
      route,
      /sendOrderPaymentReceiptForPayment|sendPaidRaffleEmails|sendDinoCoachPaymentReceiptForEntry/,
    );
  }
  assert.match(webhook, /queueAndAttemptReceipt\(supabase, 'order_payment', paymentId\)/);
  assert.match(webhook, /queueAndAttemptReceipt\(supabase, 'raffle_order', order\.id\)/);
  assert.match(webhook, /queueAndAttemptReceipt\(supabase, 'dino_entry', entry\.id\)/);
});

test('provider idempotency keys use stable payment identities', () => {
  assert.match(orderReceipt, /website-payment-receipt-\$\{paymentId\}/);
  assert.match(raffleEmail, /raffle-customer-receipt-\$\{orderId\}/);
  assert.match(raffleEmail, /receiptRecipients\(order.customer_email, STAFF\)/);
  assert.doesNotMatch(raffleEmail, /raffle-(customer|staff)-\$\{eventId\}/);
  assert.match(dinoReceipt, /dino-coach-receipt-\$\{entryId\}/);
});

test('receipt payload dates and references remain stable and canonical across retries', () => {
  assert.match(orderReceipt, /issuedDate: options\.issuedAt \|\| String\(payment\.received_at\)/);
  assert.match(raffleEmail, /issuedDate: options\.issuedAt \|\| String\(order\.paid_at\)/);
  assert.match(dinoReceipt, /issuedDate: options\.issuedAt \|\| String\(entry\.paid_at\)/);
  assert.match(orderReceipt, /isCanonicalPaymentReference\(transactionReference, category\)/);
  assert.match(raffleEmail, /isCanonicalPaymentReference\(order\.payment_reference, 'raffle'\)/);
  assert.match(dinoReceipt, /isCanonicalPaymentReference\(reference, 'dino_coach'\)/);
  assert.doesNotMatch(orderReceipt, /payment\.payment_reference \|\| order\.payment_reference/);
});

test('provider acceptance survives a source-marker write failure without resending', () => {
  for (const sender of [orderReceipt, raffleEmail, dinoReceipt]) {
    assert.match(sender, /status: 'sent_unrecorded'/);
  }
  assert.match(processor, /result\.status === 'sent_unrecorded'/);
  assert.match(processor, /Provider accepted the receipt, but its source marker was not recorded/);
  assert.match(migration, /last_error = nullif\(pg_catalog\.left\(target_error, 2000\), ''\)/);
});

test('Dino Coach bridges old event markers to source-level delivery state', () => {
  assert.match(migration, /customer_receipt_sent_at timestamptz/);
  assert.match(dinoReceipt, /fantasy_entry_payment_events/);
  assert.match(dinoReceipt, /payment_receipt_sent_at/);
  assert.match(dinoReceipt, /customer_receipt_sent_at/);
});

test('receipt references remain visible and currency remains AUD', () => {
  assert.match(raffleEmail, /payment reference is <strong>/);
  assert.match(raffleEmail, /toFixed\(2\)\} AUD/);
  assert.match(dinoReceipt, /payment reference is <strong>/);
  assert.match(dinoReceipt, /toUpperCase\(\) !== 'AUD'/);
});

test('receipt Reply-To and cron secrets are documented without live values', () => {
  assert.match(envExample, /^RECEIPT_REPLY_TO_EMAIL=$/m);
  assert.match(envExample, /CRON_SECRET must be at least 16/);
  assert.match(envExample, /\/api\/cron\/payment-receipts/);
  assert.match(readme, /`RECEIPT_REPLY_TO_EMAIL`/);
  assert.match(readme, /`CRON_SECRET` must contain at least 16 characters/);
});

test('cron route is authenticated, non-caching and transport failures remain queued', () => {
  assert.match(cronRoute, /isAuthorizedCronRequest/);
  assert.match(cronRoute, /'Cache-Control': 'no-store'/);
  assert.match(cronRoute, /processPaymentReceiptJobs/);
  assert.match(processor, /target_error: delivered \? completionNote : resultError\(result\)/);
  assert.match(cronRoute, /WORK_BUDGET_MS = 45_000/);
  assert.match(cronRoute, /processPaymentReceiptJobs\(\{[\s\S]*?limit: 1,[\s\S]*?leaseSeconds: 300/);
  assert.match(cronRoute, /dead_letter_total: deadLetterTotal/);
  assert.match(cronRoute, /due_remaining: dueRemaining/);
});

test('Hobby-compatible fallback cron runs no more than daily', () => {
  const vercel = JSON.parse(vercelRaw);
  const job = vercel.crons.find((candidate) => candidate.path === '/api/cron/payment-receipts');
  assert.ok(job);
  assert.match(job.schedule, /^\d{1,2} \d{1,2} \* \* \*$/);
});

console.log(`${passed} receipt-delivery outbox checks passed.`);
