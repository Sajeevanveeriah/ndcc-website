#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/20260830130824_stripe_financial_event_integrity.sql');
const webhook = read('app/api/stripe/webhook/route.ts');
const dinoDomain = read('lib/dino-coach/domain.ts');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

console.log('Checks:');

test('all refund and dispute lifecycle/movement events are signed-webhook inputs', () => {
  for (const type of [
    'charge.refunded',
    'charge.dispute.created',
    'charge.dispute.updated',
    'charge.dispute.closed',
    'charge.dispute.funds_withdrawn',
    'charge.dispute.funds_reinstated',
  ]) assert.match(webhook, new RegExp(`'${type.replaceAll('.', '\\.')}'`, 'u'));
  assert.ok(
    webhook.indexOf('constructEvent(') < webhook.indexOf('handleFinancialEvent(event)'),
    'Financial handling must follow raw-body signature verification.',
  );
});

test('the webhook retrieves the current Dispute and validates its native balance-transaction objects', () => {
  assert.match(webhook, /disputes\.retrieve\(disputeId\)/u);
  assert.doesNotMatch(webhook, /expand:\s*\['balance_transactions'\]/u);
  assert.match(webhook, /Stripe did not return full Dispute balance transactions/u);
  assert.match(webhook, /DISPUTE_MOVEMENT_EVENT_TYPES[\s\S]*?transactions\.length === 0/u);
  assert.match(webhook, /target_balance_movements:\s*DISPUTE_MOVEMENT_EVENT_TYPES\.has\(event\.type\) \? movements : \[\]/u);
  assert.match(migration, /Stripe dispute lifecycle snapshots cannot move money/u);
  assert.match(webhook, /balance_transaction_ids:\s*movements\.map/u);
});

test('one atomic private RPC owns all financial domain mutations', () => {
  assert.equal((migration.match(/create or replace function public\.apply_stripe_financial_event\(/gu) || []).length, 1);
  assert.doesNotMatch(migration, /create or replace function public\.apply_(?:order|raffle)_stripe_financial_event/u);
  assert.match(migration, /create or replace function public\.apply_stripe_financial_event\([\s\S]*?security definer[\s\S]*?set search_path = ''/u);
  assert.match(migration, /revoke all on function public\.apply_stripe_financial_event[\s\S]*?from public, anon, authenticated/u);
  assert.match(migration, /grant execute on function public\.apply_stripe_financial_event[\s\S]*?to service_role/u);
});

test('dispute snapshots and signed movements have independent Stripe identities', () => {
  assert.match(migration, /create table if not exists public\.stripe_disputes/u);
  assert.match(migration, /dispute_id text primary key check \(dispute_id ~ '\^du_'\)/u);
  assert.match(migration, /create table if not exists public\.stripe_dispute_balance_movements/u);
  assert.match(migration, /balance_transaction_id text primary key check \(balance_transaction_id ~ '\^txn_'\)/u);
  assert.match(migration, /on conflict \(dispute_id\) do update/u);
  assert.match(migration, /on conflict \(balance_transaction_id\) do nothing/u);
  assert.match(migration, /provider_event_id, status[\s\S]*?movement_id,[\s\S]*?case when movement_amount < 0 then 'disputed' else 'recovered'/u);
});

test('warnings and prevented disputes are retained but only formal adverse snapshots suspend', () => {
  for (const status of [
    'warning_needs_response', 'warning_under_review', 'warning_closed',
    'needs_response', 'under_review', 'won', 'lost', 'prevented',
  ]) assert.match(migration, new RegExp(`'${status}'`, 'u'));
  assert.match(migration, /status in \('needs_response', 'under_review', 'lost'\)/u);
  assert.doesNotMatch(migration, /status in \([^)]*warning_needs_response[^)]*\)[\s\S]{0,80}active_disputes/u);
  assert.doesNotMatch(migration, /Won (?:raffle |Dino Coach )?dispute arrived before/u);
});

test('out-of-order lifecycle delivery uses observation time and cannot regress formal state', () => {
  assert.match(webhook, /const snapshotObservedAt = new Date\(\)\.toISOString\(\)/u);
  assert.match(migration, /snapshot_observed_at timestamptz not null/u);
  assert.match(migration, /on conflict \(dispute_id\) do update set[\s\S]*?snapshot_observed_at = excluded\.snapshot_observed_at/u);
  assert.match(migration, /stripe_disputes\.status not in \('won', 'lost', 'prevented'\)[\s\S]*?excluded\.snapshot_observed_at > public\.stripe_disputes\.snapshot_observed_at/u);
  assert.match(migration, /excluded\.status in \('needs_response', 'under_review'\) then 2[\s\S]*?stripe_disputes\.status in \('needs_response', 'under_review'\) then 2/u);
  assert.doesNotMatch(migration, /stripe_disputes\.status not in \('warning_closed', 'won', 'lost', 'prevented'\)/u);
  assert.match(migration, /'target_snapshot_observed_at', target_snapshot_observed_at/u);
  assert.match(migration, /payment_domain = 'pending'[\s\S]*?evidence #>> '\{rpc_args,target_snapshot_observed_at\}'[\s\S]*?<= target_snapshot_observed_at/u);
});

test('refund snapshots stay independent and monotonic under unordered events', () => {
  assert.match(migration, /create table if not exists public\.stripe_charge_refund_snapshots/u);
  assert.match(migration, /on conflict \(charge_id\) do update set[\s\S]*?greatest\([\s\S]*?amount_refunded_cents/u);
  assert.match(migration, /total_refunded_cents - already_recorded_refund_cents/u);
});

test('raw negative order net is preserved as review evidence and customer paid is floored', () => {
  assert.match(migration, /raw_paid := settled - refunded - disputed \+ recovered/u);
  assert.match(migration, /paid := greatest\(raw_paid, 0\)/u);
  assert.match(migration, /if raw_paid < 0[\s\S]*?derived_status := 'needs_review'/u);
  assert.doesNotMatch(migration, /raise exception 'Payment reversals exceed settled funds/u);
});

test('recognised unmatched events are durable and replay after each settlement domain', () => {
  assert.match(migration, /payment_domain = 'pending'/u);
  assert.match(migration, /'rpc_args', replay_arguments/u);
  assert.match(webhook, /replayDeferredFinancialEvents/u);
  assert.match(webhook, /\.eq\('payment_domain', 'pending'\)/u);
  assert.ok((webhook.match(/replayDeferredFinancialEvents\(supabase, intentId\)/gu) || []).length >= 2);
  assert.match(webhook, /finishOrderSettlement[\s\S]*?replayDeferredFinancialEvents\(supabase, paymentIntent\)/u);
  assert.doesNotMatch(webhook, /NDCC settlement is not yet available for reconciliation/u);
});

test('PaymentIntent-scoped transaction locks close the deferral/settlement handoff race', () => {
  const lockPattern = /pg_advisory_xact_lock\([\s\S]{0,100}?hashtextextended\(target_payment_intent_id, 614749110\)/gu;
  assert.ok((migration.match(lockPattern) || []).length >= 5);
  for (const functionName of [
    'apply_stripe_financial_event',
    'settle_stripe_order_payment',
    'ensure_legacy_stripe_payment_reference',
    'issue_paid_raffle_tickets',
    'apply_dino_entry_payment_event',
  ]) {
    assert.match(
      migration,
      new RegExp(`create or replace function public\\.${functionName}\\([\\s\\S]*?pg_advisory_xact_lock\\([\\s\\S]*?for update`, 'u'),
    );
  }
  assert.match(webhook, /rpc\('settle_stripe_order_payment'/u);
  assert.doesNotMatch(webhook, /from\('order_payments'\)[\s\S]{0,180}?\.update\(\{\s*status:\s*'settled'/u);
  assert.match(migration, /create or replace function public\.settle_stripe_order_payment\([\s\S]*?security definer[\s\S]*?set search_path = ''/u);
});

test('legacy in-flight sessions are validated, canonically upgraded and reportable', () => {
  assert.match(migration, /create or replace function public\.ensure_legacy_stripe_payment_reference/u);
  assert.match(migration, /where provider = 'stripe' and provider_reference = target_checkout_session_id[\s\S]*?for update;[\s\S]*?if found then/u);
  assert.match(migration, /if found then[\s\S]*?payment\.order_id <> ordinary_order\.id[\s\S]*?elsif ordinary_order\.stripe_session_id is distinct from target_checkout_session_id/u);
  assert.match(migration, /dino\.stripe_payment_intent_id is not null[\s\S]*?dino\.stripe_payment_intent_id <> target_payment_intent_id/u);
  assert.doesNotMatch(migration, /dino\.stripe_checkout_session_id is not null[\s\S]{0,100}?dino\.stripe_checkout_session_id <> target_checkout_session_id/u);
  assert.match(migration, /update public\.fantasy_entries set[\s\S]*?stripe_checkout_session_id = target_checkout_session_id,[\s\S]*?stripe_payment_intent_id = coalesce/u);
  assert.match(webhook, /isCleanLegacyContract/u);
  for (const domain of ['order', 'raffle', 'dino_coach']) {
    assert.match(webhook, new RegExp(`domain: '${domain}'`, 'u'));
  }
  assert.match(webhook, /paymentIntents\.update\(paymentIntent,[\s\S]*?description:[\s\S]*?metadata/u);
  assert.match(webhook, /LEGACY_ORDER_CATEGORIES\.has\(metadata\.order_category\)/u);
  for (const key of [
    'ndcc_payment_reference', 'ndcc_payment_type', 'ndcc_order_id',
    'ndcc_reference_version', 'item_number',
  ]) assert.match(webhook, new RegExp(`${key}:`, 'u'));
});

test('legacy financial identity lookup never acknowledges a transient Session-list failure as ignored', () => {
  assert.match(webhook, /try \{[\s\S]*?checkout\.sessions\.list\([\s\S]*?catch \(error\) \{[\s\S]*?hasLegacyOrderPaymentIntentHint[\s\S]*?throw error/u);
  assert.doesNotMatch(webhook, /checkout\.sessions\.list\([\s\S]{0,160}?\.catch\(\(\) => null\)/u);
});

test('settlement RPCs reject empty PaymentIntent IDs and preserve ticket idempotency', () => {
  assert.match(migration, /Invalid Stripe order settlement contract/u);
  assert.match(migration, /Raffle settlement requires a PaymentIntent/u);
  assert.match(migration, /target_resulting_status = 'paid' and \([\s\S]*?coalesce\(target_payment_intent_id, ''\) = ''[\s\S]*?target_payment_intent_id !~ '\^pi_'/u);
  assert.match(migration, /if exists \([\s\S]*?from public\.raffle_tickets where raffle_order_id = target_order\.id/u);
  assert.match(webhook, /Invalid AUD settlement or missing PaymentIntent/u);
});

test('financial children are cascade-compatible and test cleanup is explicitly child-first', () => {
  assert.match(migration, /references public\.order_payments\(id\) on delete cascade/u);
  for (const table of [
    'stripe_dispute_balance_movements',
    'stripe_charge_refund_snapshots',
    'stripe_disputes',
    'stripe_payment_events',
  ]) assert.match(migration, new RegExp(`delete from ${table}`, 'u'));
  assert.ok(
    migration.indexOf('delete from stripe_dispute_balance_movements')
      < migration.lastIndexOf('delete from order_payments'),
  );
});

test('receipt delivery is source-idempotent and transport failures do not roll back finance', () => {
  assert.match(webhook, /enqueuePaymentReceiptJob/u);
  assert.match(webhook, /attemptPaymentReceiptDelivery/u);
  assert.match(webhook, /bestEffortPaidStaffNotice/u);
  assert.match(webhook, /bestEffortDinoEligibilityNotice/u);
  assert.doesNotMatch(webhook, /sendOrderPaymentReceiptForPayment|sendPaidRaffleEmails|buildPaymentReceiptPdf/u);
  assert.doesNotMatch(webhook, /Paid staff notification[^\n]*status:\s*500/u);
  assert.doesNotMatch(webhook, /eligibility email delivery failed[^\n]*status:\s*500/iu);
});

test('Dino domain helper cannot independently derive refund/dispute eligibility', () => {
  assert.doesNotMatch(dinoDomain, /eventType === 'charge\.refunded'/u);
  assert.doesNotMatch(dinoDomain, /eventType === 'charge\.dispute/u);
});

console.log(`\ntest-stripe-dispute-integrity: ${passed} tests passed`);
