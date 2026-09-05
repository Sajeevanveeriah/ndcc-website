/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createServerClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { isPaymentTestMode } from '@/lib/payments/payment-config';
import { getCheckoutEventAction } from '@/lib/payments/stripe-checkout';
import { sendPaidStaffOrderNotificationForPayment } from '@/lib/order-notifications';
import { emailHtml, getTransactionalReplyTo, sendEmail } from '@/lib/email';
import { dinoEntryStatusForStripeEvent } from '@/lib/dino-coach/domain';
import {
  isCanonicalPaymentReference,
  normalisePaymentReferenceCategory,
  type PaymentReferenceCategory,
} from '@/lib/payments/reference';
import {
  attemptPaymentReceiptDelivery,
  enqueuePaymentReceiptJob,
  type ReceiptDeliveryKind,
} from '@/lib/payments/receipt-delivery';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
const LEGACY_ORDER_CATEGORIES = new Set([
  'donation',
  'merch',
  'merchandise',
  'kitchen',
  'membership',
  'event',
  'general',
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

type ServerSupabase = ReturnType<typeof createServerClient>;
type LedgerRow = {
  id: string;
  order_id: string;
  amount: number;
  payment_reference: string | null;
  status: string;
  provider_event_id: string | null;
  metadata: Record<string, unknown> | null;
};
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
type FinancialRpcResult = {
  handled?: boolean;
  duplicate?: boolean;
  deferred?: boolean;
  payment_domain?: string | null;
  order_id?: string | null;
  raffle_order_id?: string | null;
  fantasy_entry_id?: string | null;
  resulting_status?: string | null;
  state_changed?: boolean;
};

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  if (typeof session.payment_intent === 'string') return session.payment_intent;
  return session.payment_intent?.id || null;
}

function expandableId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id;
  }
  return null;
}

function cents(amount: number): number {
  return Math.round(Number(amount) * 100);
}

function escapeEmailHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] || character));
}

function hasUniversalReference(metadata: Record<string, string>): boolean {
  const paymentType = metadata.ndcc_payment_type as PaymentReferenceCategory;
  return metadata.ndcc_reference_version === '1'
    && UNIVERSAL_PAYMENT_TYPES.has(paymentType)
    && UUID_PATTERN.test(metadata.ndcc_order_id || '')
    && isCanonicalPaymentReference(metadata.ndcc_payment_reference, paymentType)
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

function disputeBalanceTransactions(dispute: any): any[] | null {
  const source = dispute?.balance_transactions;
  const items = Array.isArray(source) ? source : Array.isArray(source?.data) ? source.data : [];
  if (items.some((item: unknown) => typeof item === 'string')) return null;
  return items;
}

async function financialEventRpcParams(event: Stripe.Event): Promise<FinancialRpcParams | null> {
  const eventObject = event.data.object as any;
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
  const dispute = await getStripe().disputes.retrieve(disputeId).catch(() => null) as any;
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

async function bestEffortDinoEligibilityNotice(
  supabase: ServerSupabase,
  entryId: string,
  status: string,
  eventId: string,
) {
  if (status === 'paid') return;
  try {
    const { data: entry, error } = await supabase
      .from('fantasy_entries')
      .select('id,fantasy_managers(display_name,email)')
      .eq('id', entryId)
      .maybeSingle();
    const manager = Array.isArray((entry as any)?.fantasy_managers)
      ? (entry as any).fantasy_managers[0]
      : (entry as any)?.fantasy_managers;
    if (error || !manager?.email) {
      if (error) console.error('Dino Coach eligibility recipient lookup failed:', error);
      return;
    }
    const result = await sendEmail({
      to: manager.email,
      replyTo: getTransactionalReplyTo(),
      subject: 'Dino Coach entry eligibility update',
      html: emailHtml(
        'Entry eligibility update',
        `<p>Hi ${escapeEmailHtml(manager.display_name)},</p><p>Your Dino Coach entry status is now <strong>${escapeEmailHtml(status)}</strong>.</p><p>Team-selection eligibility is paused while this payment status applies. Contact the club if you need help.</p>`,
      ),
      idempotencyKey: `dino-coach-eligibility-${eventId}`,
    });
    if (result.status !== 'sent' && result.status !== 'simulated') {
      console.error('Dino Coach eligibility email delivery failed:', result.reason);
    }
  } catch (error) {
    console.error('Dino Coach eligibility notice threw after durable state was recorded:', error);
  }
}

async function handleFinancialEvent(event: Stripe.Event): Promise<NextResponse | null> {
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

async function replayDeferredFinancialEvents(
  supabase: ServerSupabase,
  paymentIntent: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const pending = await supabase
    .from('stripe_payment_events')
    .select('provider_event_id,evidence')
    .eq('payment_intent_id', paymentIntent)
    .eq('payment_domain', 'pending')
    .order('provider_created_at', { ascending: true })
    .order('provider_event_id', { ascending: true });
  if (pending.error) return { ok: false, reason: pending.error.message };
  for (const event of pending.data || []) {
    const args = (event.evidence as Record<string, unknown> | null)?.rpc_args;
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return { ok: false, reason: `Deferred Stripe event ${event.provider_event_id} has invalid replay evidence.` };
    }
    const replayed = await supabase.rpc(
      'apply_stripe_financial_event',
      args as Record<string, unknown>,
    );
    const result = replayed.data?.[0] as FinancialRpcResult | undefined;
    if (replayed.error || !result?.handled || result.deferred) {
      return {
        ok: false,
        reason: replayed.error?.message
          || `Deferred Stripe event ${event.provider_event_id} could not be applied after settlement.`,
      };
    }
  }
  return { ok: true };
}

async function queueAndAttemptReceipt(
  supabase: ServerSupabase,
  kind: ReceiptDeliveryKind,
  sourceId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const queued = await enqueuePaymentReceiptJob(supabase, kind, sourceId);
  if (!queued.ok) return queued;
  try {
    const attempt = await attemptPaymentReceiptDelivery(supabase, queued.jobId);
    if (!['delivered', 'not_claimed'].includes(attempt.status)) {
      console.error(
        `Receipt job ${queued.jobId} remains durable with status ${attempt.status}:`,
        attempt.reason || 'retry scheduled',
      );
    }
  } catch (error) {
    console.error(`Receipt job ${queued.jobId} remains queued after an immediate-attempt error:`, error);
  }
  return { ok: true };
}

async function bestEffortPaidStaffNotice(
  supabase: ServerSupabase,
  paymentId: string,
  orderId: string,
) {
  try {
    const result = await sendPaidStaffOrderNotificationForPayment(
      supabase,
      { id: paymentId },
      orderId,
    );
    if (result.status === 'failed') {
      console.error(`Paid staff notification for order ${orderId} failed after settlement:`, result.reason);
    }
  } catch (error) {
    console.error(`Paid staff notification for order ${orderId} threw after settlement:`, error);
  }
}

function universalPaymentMetadata(
  paymentReference: string,
  paymentType: PaymentReferenceCategory,
  recordId: string,
  legacyMetadata: Record<string, string>,
): Record<string, string> {
  return {
    ...legacyMetadata,
    ndcc_payment_reference: paymentReference,
    ndcc_payment_type: paymentType,
    ndcc_order_id: recordId,
    ndcc_reference_version: '1',
    item_number: paymentReference,
  };
}

async function upgradeLegacyPaymentIntent(
  paymentIntent: string,
  paymentReference: string,
  paymentType: PaymentReferenceCategory,
  recordId: string,
  legacyMetadata: Record<string, string>,
): Promise<boolean> {
  const metadata = universalPaymentMetadata(
    paymentReference,
    paymentType,
    recordId,
    legacyMetadata,
  );
  const updated = await getStripe().paymentIntents.update(paymentIntent, {
    description: `${paymentReference} - NDCC ${paymentType.replaceAll('_', ' ')}`,
    metadata,
  }).catch(() => null);
  return Boolean(updated
    && updated.metadata?.ndcc_payment_reference === paymentReference
    && updated.metadata?.item_number === paymentReference
    && updated.metadata?.ndcc_payment_type === paymentType
    && updated.metadata?.ndcc_order_id === recordId
    && updated.metadata?.ndcc_reference_version === '1');
}

async function ensureLegacyReference(
  supabase: ServerSupabase,
  input: {
    domain: 'order' | 'raffle' | 'dino_coach';
    recordId: string;
    sessionId: string;
    paymentIntent: string;
    amountCents: number;
    orderCategory?: string | null;
    paymentKind?: string | null;
    legacyReference?: string | null;
  },
): Promise<{ paymentReference: string; paymentType: PaymentReferenceCategory; ledgerPaymentId: string | null } | null> {
  const result = await supabase.rpc('ensure_legacy_stripe_payment_reference', {
    target_payment_domain: input.domain,
    target_record_id: input.recordId,
    target_checkout_session_id: input.sessionId,
    target_payment_intent_id: input.paymentIntent,
    target_amount_cents: input.amountCents,
    target_order_category: input.orderCategory || null,
    target_payment_kind: input.paymentKind || null,
    target_legacy_reference: input.legacyReference || null,
  });
  const ensured = result.data?.[0];
  const paymentType = normalisePaymentReferenceCategory(ensured?.payment_type);
  if (result.error || !isCanonicalPaymentReference(ensured?.payment_reference, paymentType)) {
    console.error(`Legacy ${input.domain} payment-reference upgrade failed:`, result.error);
    return null;
  }
  return {
    paymentReference: ensured.payment_reference,
    paymentType,
    ledgerPaymentId: typeof ensured.ledger_payment_id === 'string'
      ? ensured.ledger_payment_id
      : null,
  };
}

function isCleanLegacyContract(metadata: Record<string, string>): boolean {
  return !metadata.ndcc_reference_version
    && !metadata.ndcc_payment_reference
    && !metadata.item_number
    && !metadata.ndcc_order_id
    && !metadata.ndcc_payment_type;
}

async function handleDinoCoachCheckout(event: Stripe.Event): Promise<NextResponse | null> {
  if (!event.type.startsWith('checkout.session.')) return null;
  const session = event.data.object as Stripe.Checkout.Session;
  const metadata = (session.metadata || {}) as Record<string, string>;
  if (metadata.product !== 'Dino Coach') return null;
  const entryId = metadata.entry_id;
  if (!entryId || !UUID_PATTERN.test(entryId)) {
    return NextResponse.json({ error: 'Invalid Dino Coach entry metadata.' }, { status: 400 });
  }
  const supabase = createServerClient();
  const found = await supabase
    .from('fantasy_entries')
    .select('*,fantasy_managers(display_name,email,team_name)')
    .eq('id', entryId)
    .maybeSingle();
  if (found.error || !found.data) {
    return NextResponse.json({ error: 'Dino Coach entry was not found.' }, { status: 404 });
  }
  const entry: any = found.data;
  if (entry.manager_id !== metadata.manager_id
    || entry.season_id !== metadata.season_id
    || entry.entry_fee_cents !== Number(metadata.expected_amount_cents)) {
    return NextResponse.json({ error: 'Dino Coach Checkout metadata mismatch.' }, { status: 400 });
  }

  const nextStatus = dinoEntryStatusForStripeEvent(event.type, {
    paymentStatus: session.payment_status,
  });
  if (!nextStatus) return NextResponse.json({ received: true, ignored: true });
  const isPaidSettlement = nextStatus === 'paid';
  const intentId = paymentIntentId(session);
  if (isPaidSettlement && (
    session.payment_status !== 'paid'
    || session.amount_total !== entry.entry_fee_cents
    || String(session.currency).toLowerCase() !== 'aud'
    || !intentId
  )) {
    return NextResponse.json({ error: 'Dino Coach settlement amount, currency or PaymentIntent mismatch.' }, { status: 400 });
  }

  let paymentReference = String(entry.payment_reference || '');
  const modern = metadata.ndcc_reference_version === '1';
  if (modern) {
    if (!isCanonicalPaymentReference(paymentReference, 'dino_coach')
      || metadata.ndcc_payment_reference !== paymentReference
      || metadata.item_number !== paymentReference
      || metadata.ndcc_payment_type !== 'dino_coach'
      || metadata.ndcc_order_id !== entry.id
      || metadata.payment_reference !== paymentReference
      || session.client_reference_id !== paymentReference) {
      return NextResponse.json({ error: 'Dino Coach payment-reference contract mismatch.' }, { status: 400 });
    }
  } else {
    if (!isCleanLegacyContract(metadata) || session.client_reference_id !== entry.id) {
      return NextResponse.json({ error: 'Malformed legacy Dino Coach Checkout contract.' }, { status: 400 });
    }
    if (isPaidSettlement && intentId) {
      const ensured = await ensureLegacyReference(supabase, {
        domain: 'dino_coach',
        recordId: entry.id,
        sessionId: session.id,
        paymentIntent: intentId,
        amountCents: entry.entry_fee_cents,
      });
      if (!ensured) {
        return NextResponse.json({ error: 'Dino Coach payment reference could not be upgraded.' }, { status: 500 });
      }
      paymentReference = ensured.paymentReference;
      const upgraded = await upgradeLegacyPaymentIntent(
        intentId,
        paymentReference,
        'dino_coach',
        entry.id,
        metadata,
      );
      if (!upgraded) {
        return NextResponse.json({ error: 'Dino Coach PaymentIntent upgrade is temporarily unavailable.' }, { status: 503 });
      }
    }
  }

  const paymentEvent = await supabase.rpc('apply_dino_entry_payment_event', {
    target_entry_id: entry.id,
    target_provider_event_id: event.id,
    target_provider_event_type: event.type,
    target_provider_created_at: new Date(event.created * 1000).toISOString(),
    target_resulting_status: nextStatus,
    target_checkout_session_id: session.id,
    target_payment_intent_id: intentId,
    target_evidence: {
      checkout_session_id: session.id,
      payment_intent_id: intentId,
      payment_reference: paymentReference || null,
      amount_cents: Number(session.amount_total || 0),
      legacy_contract_upgraded: !modern && isPaidSettlement,
    },
  });
  if (paymentEvent.error) {
    console.error('Dino Coach settlement RPC failed:', paymentEvent.error);
    return NextResponse.json({ error: 'Could not atomically record Dino Coach payment eligibility.' }, { status: 500 });
  }
  const duplicate = paymentEvent.data?.[0]?.duplicate === true;
  let appliedStatus = String(paymentEvent.data?.[0]?.entry_status || nextStatus);

  if (isPaidSettlement && intentId) {
    const replayed = await replayDeferredFinancialEvents(supabase, intentId);
    if (!replayed.ok) {
      console.error('Dino Coach deferred financial replay failed:', replayed.reason);
      return NextResponse.json({ error: 'Deferred Stripe financial events could not be replayed.' }, { status: 500 });
    }
    const refreshed = await supabase
      .from('fantasy_entries')
      .select('status')
      .eq('id', entry.id)
      .maybeSingle();
    if (refreshed.error) {
      return NextResponse.json({ error: 'Dino Coach post-settlement state could not be verified.' }, { status: 500 });
    }
    appliedStatus = String(refreshed.data?.status || appliedStatus);
    if (appliedStatus === 'paid') {
      const receipt = await queueAndAttemptReceipt(supabase, 'dino_entry', entry.id);
      if (!receipt.ok) {
        console.error('Dino Coach receipt could not be queued:', receipt.reason);
        return NextResponse.json({ error: 'Receipt delivery could not be queued.' }, { status: 500 });
      }
    }
  }
  if (!duplicate && appliedStatus !== 'paid') {
    await bestEffortDinoEligibilityNotice(supabase, entry.id, appliedStatus, event.id);
  }
  return NextResponse.json({
    received: true,
    dinoCoach: true,
    status: appliedStatus,
    duplicate,
    legacy_upgraded: !modern && isPaidSettlement,
  });
}

async function handleRaffleCheckout(event: Stripe.Event): Promise<NextResponse | null> {
  if (!event.type.startsWith('checkout.session.')) return null;
  const session = event.data.object as Stripe.Checkout.Session;
  const metadata = (session.metadata || {}) as Record<string, string>;
  if (metadata.product !== 'NDCC Raffle') return null;
  const orderId = metadata.raffle_order_id;
  if (!orderId || !UUID_PATTERN.test(orderId)) {
    return NextResponse.json({ error: 'Invalid raffle order metadata.' }, { status: 400 });
  }
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    return NextResponse.json({ received: true, raffle: true, pending: true });
  }
  const intentId = paymentIntentId(session);
  if (session.payment_status !== 'paid'
    || session.currency?.toLowerCase() !== 'aud'
    || !intentId) {
    return NextResponse.json({ received: true, raffle: true, pending: true });
  }

  const supabase = createServerClient();
  const lookup = await supabase
    .from('raffle_orders')
    .select('id,amount_cents,quantity,payment_reference')
    .eq('id', orderId)
    .maybeSingle();
  const order = lookup.data;
  if (lookup.error || !order) {
    return NextResponse.json({ error: 'Raffle order not found.' }, { status: 404 });
  }
  const expected = Number(metadata.expected_amount_cents);
  if (session.amount_total !== order.amount_cents
    || expected !== order.amount_cents
    || Number(metadata.quantity) !== order.quantity) {
    return NextResponse.json({ error: 'Raffle settlement mismatch.' }, { status: 400 });
  }

  let paymentReference = String(order.payment_reference || '');
  const modern = metadata.ndcc_reference_version === '1';
  if (modern) {
    if (!isCanonicalPaymentReference(paymentReference, 'raffle')
      || metadata.ndcc_payment_reference !== paymentReference
      || metadata.item_number !== paymentReference
      || metadata.ndcc_payment_type !== 'raffle'
      || metadata.ndcc_order_id !== order.id
      || metadata.payment_reference !== paymentReference
      || session.client_reference_id !== paymentReference) {
      return NextResponse.json({ error: 'Raffle payment-reference contract mismatch.' }, { status: 400 });
    }
  } else {
    if (!isCleanLegacyContract(metadata) || session.client_reference_id !== order.id) {
      return NextResponse.json({ error: 'Malformed legacy raffle Checkout contract.' }, { status: 400 });
    }
    const ensured = await ensureLegacyReference(supabase, {
      domain: 'raffle',
      recordId: order.id,
      sessionId: session.id,
      paymentIntent: intentId,
      amountCents: order.amount_cents,
    });
    if (!ensured) {
      return NextResponse.json({ error: 'Raffle payment reference could not be upgraded.' }, { status: 500 });
    }
    paymentReference = ensured.paymentReference;
    const upgraded = await upgradeLegacyPaymentIntent(
      intentId,
      paymentReference,
      'raffle',
      order.id,
      metadata,
    );
    if (!upgraded) {
      return NextResponse.json({ error: 'Raffle PaymentIntent upgrade is temporarily unavailable.' }, { status: 503 });
    }
  }

  const issued = await supabase.rpc('issue_paid_raffle_tickets', {
    target_order_id: order.id,
    target_provider_event_id: event.id,
    target_session_id: session.id,
    target_payment_intent_id: intentId,
  });
  if (issued.error || !issued.data?.length) {
    console.error('Raffle ticket allocation failed:', issued.error);
    return NextResponse.json({ error: 'Raffle ticket allocation failed.' }, { status: 500 });
  }
  const replayed = await replayDeferredFinancialEvents(supabase, intentId);
  if (!replayed.ok) {
    console.error('Raffle deferred financial replay failed:', replayed.reason);
    return NextResponse.json({ error: 'Deferred Stripe financial events could not be replayed.' }, { status: 500 });
  }
  const status = await supabase.from('raffle_orders').select('status').eq('id', order.id).maybeSingle();
  if (status.error) {
    return NextResponse.json({ error: 'Raffle post-settlement state could not be verified.' }, { status: 500 });
  }
  if (status.data?.status === 'paid') {
    const receipt = await queueAndAttemptReceipt(supabase, 'raffle_order', order.id);
    if (!receipt.ok) {
      console.error('Raffle receipt could not be queued:', receipt.reason);
      return NextResponse.json({ error: 'Receipt delivery could not be queued.' }, { status: 500 });
    }
  }
  return NextResponse.json({
    received: true,
    raffle: true,
    status: status.data?.status || 'paid',
    duplicate: issued.data.every((ticket: { duplicate: boolean }) => ticket.duplicate),
    legacy_upgraded: !modern,
  });
}

async function markSessionFailed(
  session: Stripe.Checkout.Session,
  event: Stripe.Event,
) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('order_payments')
    .update({ status: 'failed', provider_event_id: event.id })
    .eq('provider', 'stripe')
    .eq('provider_reference', session.id)
    .eq('status', 'pending');
  if (error) {
    console.error(`Webhook: failed to mark Stripe session ${session.id} as failed:`, error);
    return NextResponse.json({ error: 'Failed to update payment attempt.' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

async function finishOrderSettlement(
  supabase: ServerSupabase,
  paymentId: string,
  orderId: string,
  paymentIntent: string,
): Promise<NextResponse | null> {
  const replayed = await replayDeferredFinancialEvents(supabase, paymentIntent);
  if (!replayed.ok) {
    console.error('Order deferred financial replay failed:', replayed.reason);
    return NextResponse.json({ error: 'Deferred Stripe financial events could not be replayed.' }, { status: 500 });
  }
  const receipt = await queueAndAttemptReceipt(supabase, 'order_payment', paymentId);
  if (!receipt.ok) {
    console.error('Order receipt could not be queued:', receipt.reason);
    return NextResponse.json({ error: 'Receipt delivery could not be queued.' }, { status: 500 });
  }
  await bestEffortPaidStaffNotice(supabase, paymentId, orderId);
  return null;
}

async function settleSession(session: Stripe.Checkout.Session, event: Stripe.Event) {
  const metadata = (session.metadata || {}) as Record<string, string>;
  const orderId = metadata.order_id;
  if (!orderId || !UUID_PATTERN.test(orderId)) {
    console.warn(`Webhook: Stripe session ${session.id} is not linked to a valid NDCC order; ignored.`);
    return NextResponse.json({ received: true, ignored: true });
  }
  if (session.payment_status !== 'paid') {
    return NextResponse.json({ received: true, pending: true });
  }
  const amountCents = typeof session.amount_total === 'number' ? session.amount_total : 0;
  const intentId = paymentIntentId(session);
  if (amountCents <= 0 || (session.currency || '').toLowerCase() !== 'aud' || !intentId) {
    return NextResponse.json({ error: 'Invalid AUD settlement or missing PaymentIntent.' }, { status: 500 });
  }
  const expectedAmountCents = Number(metadata.expected_amount_cents);
  if (!Number.isInteger(expectedAmountCents) || expectedAmountCents !== amountCents) {
    return NextResponse.json({ error: 'Payment amount mismatch.' }, { status: 500 });
  }

  const supabase = createServerClient();
  const orderLookup = await supabase
    .from('orders')
    .select('id,payment_reference,order_category,stripe_session_id')
    .eq('id', orderId)
    .maybeSingle();
  const order = orderLookup.data;
  if (orderLookup.error || !order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 500 });
  }
  const paymentType = normalisePaymentReferenceCategory(order.order_category);
  const modern = metadata.ndcc_reference_version === '1';
  let legacyPaymentId: string | null = null;
  if (modern) {
    if (!isCanonicalPaymentReference(metadata.ndcc_payment_reference, paymentType)
      || metadata.item_number !== metadata.ndcc_payment_reference
      || metadata.ndcc_payment_type !== paymentType
      || metadata.ndcc_order_id !== order.id
      || metadata.order_id !== order.id
      || metadata.payment_reference !== metadata.ndcc_payment_reference
      || !['partial', 'balance'].includes(metadata.payment_kind)
      || normalisePaymentReferenceCategory(metadata.order_category) !== paymentType
      || session.client_reference_id !== metadata.ndcc_payment_reference) {
      return NextResponse.json({ error: 'Payment-reference contract mismatch.' }, { status: 500 });
    }
  } else {
    if (!isCleanLegacyContract(metadata)
      || session.client_reference_id !== order.id
      || !LEGACY_ORDER_CATEGORIES.has(metadata.order_category)
      || normalisePaymentReferenceCategory(metadata.order_category) !== paymentType
      || metadata.payment_reference !== (order.payment_reference || order.id)
      || !['partial', 'balance'].includes(metadata.payment_kind)) {
      return NextResponse.json({ error: 'Malformed legacy order Checkout contract.' }, { status: 400 });
    }
    const ensured = await ensureLegacyReference(supabase, {
      domain: 'order',
      recordId: order.id,
      sessionId: session.id,
      paymentIntent: intentId,
      amountCents,
      orderCategory: metadata.order_category,
      paymentKind: metadata.payment_kind,
      legacyReference: metadata.payment_reference,
    });
    if (!ensured) {
      return NextResponse.json({ error: 'Order payment reference could not be upgraded.' }, { status: 500 });
    }
    legacyPaymentId = ensured.ledgerPaymentId;
    const upgraded = await upgradeLegacyPaymentIntent(
      intentId,
      ensured.paymentReference,
      ensured.paymentType,
      order.id,
      metadata,
    );
    if (!upgraded) {
      return NextResponse.json({ error: 'Order PaymentIntent upgrade is temporarily unavailable.' }, { status: 503 });
    }
  }

  const existing = await supabase
    .from('order_payments')
    .select('id,order_id,amount,payment_reference,status,provider_event_id,metadata')
    .eq('provider', 'stripe')
    .eq('provider_reference', session.id)
    .maybeSingle();
  if (existing.error || !existing.data) {
    console.error('Webhook: pending Stripe ledger row unavailable:', existing.error);
    return NextResponse.json({ error: 'Payment ledger unavailable.' }, { status: 500 });
  }
  const payment = existing.data as LedgerRow;
  if ((legacyPaymentId && payment.id !== legacyPaymentId)
    || payment.order_id !== order.id
    || cents(payment.amount) !== amountCents
    || !isCanonicalPaymentReference(payment.payment_reference, paymentType)) {
    return NextResponse.json({ error: 'Payment ledger mismatch.' }, { status: 500 });
  }
  if (modern && (
    metadata.ndcc_payment_reference !== payment.payment_reference
    || metadata.item_number !== payment.payment_reference
  )) {
    return NextResponse.json({ error: 'Payment reference mismatch.' }, { status: 500 });
  }

  if (!['pending', 'failed', 'settled'].includes(payment.status)) {
    return NextResponse.json({ error: 'Payment ledger state conflict.' }, { status: 500 });
  }

  const settledMetadata = {
    ...(payment.metadata || {}),
    payment_intent: intentId,
    payment_reference: payment.payment_reference,
    item_number: payment.payment_reference,
    settlement_event_type: event.type,
  };
  const settled = await supabase.rpc('settle_stripe_order_payment', {
    target_payment_id: payment.id,
    target_order_id: order.id,
    target_checkout_session_id: session.id,
    target_payment_intent_id: intentId,
    target_provider_event_id: event.id,
    target_provider_created_at: new Date(event.created * 1000).toISOString(),
    target_amount_cents: amountCents,
    target_payment_reference: payment.payment_reference,
    target_recorded_by: modern ? 'stripe-webhook' : 'stripe-webhook-legacy-upgrade',
    target_metadata: settledMetadata,
  });
  const settlement = settled.data?.[0] as { duplicate?: boolean } | undefined;
  if (settled.error || !settlement) {
    console.error('Webhook: atomic Stripe order settlement failed:', settled.error);
    return NextResponse.json({ error: 'Failed to record payment.' }, { status: 500 });
  }
  const postSettlement = await finishOrderSettlement(supabase, payment.id, order.id, intentId);
  if (postSettlement) return postSettlement;
  return NextResponse.json({
    received: true,
    duplicate: settlement.duplicate === true,
    legacy_upgraded: !modern,
  });
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  if (event.livemode === isPaymentTestMode()) {
    console.error(`Webhook: event ${event.id} mode does not match PAYMENT_TEST_MODE.`);
    return NextResponse.json({ error: 'Webhook mode mismatch.' }, { status: 400 });
  }

  const financial = await handleFinancialEvent(event);
  if (financial) return financial;

  const dinoCoach = await handleDinoCoachCheckout(event);
  if (dinoCoach) return dinoCoach;

  const raffle = await handleRaffleCheckout(event);
  if (raffle) return raffle;

  const session = event.data.object as Stripe.Checkout.Session;
  const action = getCheckoutEventAction(event.type, session.payment_status);
  if (action === 'ignore') return NextResponse.json({ received: true, ignored: true });
  if (action === 'pending') return NextResponse.json({ received: true, pending: true });
  if (action === 'fail') return markSessionFailed(session, event);
  return settleSession(session, event);
}
