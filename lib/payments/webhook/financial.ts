import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createServerClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import {
  isCanonicalPaymentReference,
  type PaymentReferenceCategory,
} from '@/lib/payments/reference';
import { bestEffortDinoEligibilityNotice } from './dino';
import { LEGACY_ORDER_CATEGORIES, UUID_PATTERN, type FinancialRpcResult } from './shared';

// Signed refund and dispute events (charge.refunded, charge.dispute.*).

const FINANCIAL_EVENT_TYPES = new Set([
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
]);
const DISPUTE_MOVEMENT_EVENT_TYPES = new Set([
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
]);
const UNIVERSAL_PAYMENT_TYPES = new Set<PaymentReferenceCategory>([
  'merch',
  'kitchen',
  'membership',
  'event',
  'raffle',
  'dino_coach',
  'general',
]);

type FinancialRpcParams = {
  target_payment_intent_id: string;
  target_provider_event_id: string;
  target_event_type: string;
  target_event_created_at: string;
  target_charge_id: string | null;
  target_currency: string;
  target_charge_amount_cents: number | null;
  target_amount_refunded_cents: number | null;
  target_dispute_id: string | null;
  target_dispute_status: string | null;
  target_dispute_reason: string | null;
  target_dispute_amount_cents: number | null;
  target_dispute_created_at: string | null;
  target_snapshot_observed_at: string | null;
  target_balance_movements: Array<Record<string, unknown>>;
  target_recognised_ndcc: boolean;
  target_evidence: Record<string, unknown>;
};

function expandableId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id;
  }
  return null;
}

function hasUniversalReference(metadata: Record<string, string>): boolean {
  const paymentType = metadata.ndcc_payment_type as PaymentReferenceCategory;
  return (metadata.ndcc_reference_version === '1' || metadata.ndcc_reference_version === '2')
    && UNIVERSAL_PAYMENT_TYPES.has(paymentType)
    && UUID_PATTERN.test(metadata.ndcc_order_id || '')
    && isCanonicalPaymentReference(metadata.ndcc_reference_version === '2'
      ? metadata.ndcc_transaction_reference : metadata.ndcc_payment_reference, paymentType)
    && metadata.item_number === metadata.ndcc_payment_reference;
}

function isPositiveIntegerMetadata(value: string | undefined): boolean {
  return Boolean(value && /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value)));
}

function looksLikeLegacyNdccMetadata(metadata: Record<string, string>): boolean {
  if (metadata.order_id && UUID_PATTERN.test(metadata.order_id)
    && LEGACY_ORDER_CATEGORIES.has(metadata.order_category)
    && ['partial', 'balance'].includes(metadata.payment_kind)
    && Boolean(metadata.payment_reference)
    && isPositiveIntegerMetadata(metadata.expected_amount_cents)) return true;
  if (metadata.product === 'NDCC Raffle' && metadata.raffle_order_id
    && UUID_PATTERN.test(metadata.raffle_order_id)
    && isPositiveIntegerMetadata(metadata.expected_amount_cents)
    && isPositiveIntegerMetadata(metadata.quantity)) return true;
  return metadata.product === 'Dino Coach'
    && UUID_PATTERN.test(metadata.entry_id || '')
    && UUID_PATTERN.test(metadata.manager_id || '')
    && UUID_PATTERN.test(metadata.season_id || '')
    && isPositiveIntegerMetadata(metadata.expected_amount_cents);
}

function hasLegacyOrderPaymentIntentHint(metadata: Record<string, string>): boolean {
  return UUID_PATTERN.test(metadata.order_id || '')
    && LEGACY_ORDER_CATEGORIES.has(metadata.order_category)
    && Boolean(metadata.payment_reference);
}

async function resolveNdccPaymentIntent(
  paymentIntent: string,
): Promise<{ recognised: boolean; metadata: Record<string, string> } | null> {
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(paymentIntent).catch(() => null);
  if (!intent) return null;
  let metadata = (intent.metadata || {}) as Record<string, string>;
  if (hasUniversalReference(metadata) || looksLikeLegacyNdccMetadata(metadata)) {
    return { recognised: true, metadata };
  }
  let sessions: Stripe.ApiList<Stripe.Checkout.Session>;
  try {
    sessions = await stripe.checkout.sessions.list({
      payment_intent: paymentIntent,
      limit: 1,
    });
  } catch (error) {
    // Old generic PaymentIntents retained enough NDCC identity to preserve a
    // signed event even when the Session lookup is transiently unavailable.
    // Other unknown identities must be retried, never acknowledged as ignored.
    if (hasLegacyOrderPaymentIntentHint(metadata)) {
      return { recognised: true, metadata };
    }
    throw error;
  }
  const sessionMetadata = (sessions?.data?.[0]?.metadata || {}) as Record<string, string>;
  if (Object.keys(sessionMetadata).length > 0) metadata = sessionMetadata;
  return {
    recognised: hasUniversalReference(metadata) || looksLikeLegacyNdccMetadata(metadata),
    metadata,
  };
}

// Fields read from the signed event object. A charge.refunded event carries a
// Charge; charge.dispute.* events carry a Dispute (only its id is used).
type FinancialEventObject = {
  id?: unknown;
  payment_intent?: unknown;
  currency?: unknown;
  amount?: unknown;
  amount_refunded?: unknown;
};

function disputeBalanceTransactions(dispute: Stripe.Dispute): Stripe.BalanceTransaction[] | null {
  const source: unknown = dispute?.balance_transactions;
  const nested = (source as { data?: unknown } | null | undefined)?.data;
  const items: unknown[] = Array.isArray(source) ? source : Array.isArray(nested) ? nested : [];
  if (items.some((item: unknown) => typeof item === 'string')) return null;
  return items as Stripe.BalanceTransaction[];
}

async function financialEventRpcParams(event: Stripe.Event): Promise<FinancialRpcParams | null> {
  const eventObject = event.data.object as FinancialEventObject;
  const eventCreatedAt = new Date(event.created * 1000).toISOString();
  if (event.type === 'charge.refunded') {
    const paymentIntent = expandableId(eventObject.payment_intent);
    if (!paymentIntent) return null;
    const identity = await resolveNdccPaymentIntent(paymentIntent);
    if (!identity) throw new Error('Stripe PaymentIntent could not be retrieved.');
    return {
      target_payment_intent_id: paymentIntent,
      target_provider_event_id: event.id,
      target_event_type: event.type,
      target_event_created_at: eventCreatedAt,
      target_charge_id: String(eventObject.id || ''),
      target_currency: String(eventObject.currency || '').toLowerCase(),
      target_charge_amount_cents: Number(eventObject.amount),
      target_amount_refunded_cents: Number(eventObject.amount_refunded),
      target_dispute_id: null,
      target_dispute_status: null,
      target_dispute_reason: null,
      target_dispute_amount_cents: null,
      target_dispute_created_at: null,
      target_snapshot_observed_at: null,
      target_balance_movements: [],
      target_recognised_ndcc: identity.recognised,
      target_evidence: {
        stripe_object: 'charge',
        charge_id: String(eventObject.id || ''),
        payment_intent_id: paymentIntent,
      },
    };
  }

  const disputeId = String(eventObject.id || '');
  if (!disputeId.startsWith('du_')) return null;
  const dispute = await getStripe().disputes.retrieve(disputeId).catch(() => null);
  if (!dispute) throw new Error('Current Stripe Dispute could not be retrieved.');
  const snapshotObservedAt = new Date().toISOString();
  const paymentIntent = expandableId(dispute.payment_intent);
  if (!paymentIntent) return null;
  const identity = await resolveNdccPaymentIntent(paymentIntent);
  if (!identity) throw new Error('Stripe PaymentIntent could not be retrieved.');
  const transactions = disputeBalanceTransactions(dispute);
  if (!transactions) throw new Error('Stripe did not return full Dispute balance transactions.');
  if (DISPUTE_MOVEMENT_EVENT_TYPES.has(event.type) && transactions.length === 0) {
    throw new Error('Stripe movement event has no current balance transaction.');
  }
  const movements = transactions.map((movement) => ({
    id: String(movement.id || ''),
    amount_cents: Number(movement.amount),
    fee_cents: Number(movement.fee || 0),
    net_cents: Number(movement.net ?? (Number(movement.amount) - Number(movement.fee || 0))),
    currency: String(movement.currency || '').toLowerCase(),
    created_at: new Date(Number(movement.created) * 1000).toISOString(),
    type: typeof movement.type === 'string' ? movement.type : null,
    reporting_category: typeof movement.reporting_category === 'string'
      ? movement.reporting_category
      : null,
  }));
  return {
    target_payment_intent_id: paymentIntent,
    target_provider_event_id: event.id,
    target_event_type: event.type,
    target_event_created_at: eventCreatedAt,
    target_charge_id: expandableId(dispute.charge),
    target_currency: String(dispute.currency || '').toLowerCase(),
    target_charge_amount_cents: null,
    target_amount_refunded_cents: null,
    target_dispute_id: String(dispute.id || ''),
    target_dispute_status: String(dispute.status || ''),
    target_dispute_reason: typeof dispute.reason === 'string' ? dispute.reason : null,
    target_dispute_amount_cents: Number(dispute.amount),
    target_dispute_created_at: new Date(Number(dispute.created) * 1000).toISOString(),
    target_snapshot_observed_at: snapshotObservedAt,
    target_balance_movements: DISPUTE_MOVEMENT_EVENT_TYPES.has(event.type) ? movements : [],
    target_recognised_ndcc: identity.recognised,
    target_evidence: {
      stripe_object: 'dispute',
      dispute_id: String(dispute.id || ''),
      charge_id: expandableId(dispute.charge),
      payment_intent_id: paymentIntent,
      status: String(dispute.status || ''),
      balance_transaction_ids: movements.map((movement) => movement.id),
      snapshot_observed_at: snapshotObservedAt,
    },
  };
}

export async function handleFinancialEvent(event: Stripe.Event): Promise<NextResponse | null> {
  if (!FINANCIAL_EVENT_TYPES.has(event.type)) return null;
  let params: FinancialRpcParams | null;
  try {
    params = await financialEventRpcParams(event);
  } catch (error) {
    console.error(`Stripe ${event.type} could not be normalised:`, error);
    return NextResponse.json({ error: 'Stripe financial evidence is temporarily unavailable.' }, { status: 503 });
  }
  if (!params) return NextResponse.json({ received: true, ignored: true });
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc('apply_stripe_financial_event', params);
  if (error) {
    console.error(`Stripe ${event.type} reconciliation failed:`, error);
    return NextResponse.json({ error: 'Stripe financial event reconciliation failed.' }, { status: 500 });
  }
  const result = (data?.[0] || {}) as FinancialRpcResult;
  if (result.deferred) {
    return NextResponse.json({ received: true, deferred: true, duplicate: result.duplicate === true });
  }
  if (!result.handled) return NextResponse.json({ received: true, ignored: true });
  if (result.payment_domain === 'dino_coach' && result.fantasy_entry_id
    && result.state_changed && result.resulting_status) {
    await bestEffortDinoEligibilityNotice(
      supabase,
      result.fantasy_entry_id,
      result.resulting_status,
      event.id,
    );
  }
  return NextResponse.json({
    received: true,
    financial_event: event.type,
    payment_domain: result.payment_domain,
    status: result.resulting_status,
    duplicate: result.duplicate === true,
  });
}
