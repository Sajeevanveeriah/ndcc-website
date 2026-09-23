import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { mealContractMatches } from '@/lib/meal-collection';
import { createServerClient } from '@/lib/supabase-server';
import { isUuidV1ToV5 } from '@/lib/validation/uuid';
import { sendPaidStaffOrderNotificationForPayment } from '@/lib/order-notifications';
import {
  isCanonicalPaymentReference,
  normalisePaymentReferenceCategory,
} from '@/lib/payments/reference';
import {
  LEGACY_ORDER_CATEGORIES,
  ensureLegacyReference,
  isCleanLegacyContract,
  paymentIntentId,
  queueAndAttemptReceipt,
  replayDeferredFinancialEvents,
  type ServerSupabase,
  upgradeLegacyPaymentIntent,
} from './shared';

// Order (merch/kitchen/membership/event/general) Checkout Sessions.

type LedgerRow = {
  id: string;
  order_id: string;
  amount: number;
  payment_reference: string | null;
  status: string;
  provider_event_id: string | null;
  metadata: Record<string, unknown> | null;
};

function cents(amount: number): number {
  return Math.round(Number(amount) * 100);
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

export async function markSessionFailed(
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

export async function settleSession(session: Stripe.Checkout.Session, event: Stripe.Event) {
  const metadata = (session.metadata || {}) as Record<string, string>;
  const orderId = metadata.order_id;
  if (!orderId || !isUuidV1ToV5(orderId)) {
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
    .select('id,payment_reference,order_category,stripe_session_id,meal_collection_window,meal_service_date,meal_revision')
    .eq('id', orderId)
    .maybeSingle();
  const order = orderLookup.data;
  if (orderLookup.error || !order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 500 });
  }
  // Preserve legacy callbacks for historical orders with no collection contract.
  if (order.order_category === 'kitchen' && order.meal_collection_window != null
    && !mealContractMatches(order, metadata)) {
    return NextResponse.json({ error: 'Meal collection contract mismatch.' }, { status: 409 });
  }
  const paymentType = normalisePaymentReferenceCategory(order.order_category);
  const orderReferenceContract = metadata.ndcc_reference_version === '2';
  const modern = metadata.ndcc_reference_version === '1' || orderReferenceContract;
  let legacyPaymentId: string | null = null;
  if (modern) {
    if (!(orderReferenceContract
        ? metadata.ndcc_payment_reference === (order.payment_reference || order.id)
          && isCanonicalPaymentReference(metadata.ndcc_transaction_reference, paymentType)
        : isCanonicalPaymentReference(metadata.ndcc_payment_reference, paymentType))
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
    (orderReferenceContract
      ? metadata.ndcc_transaction_reference !== payment.payment_reference
        || payment.metadata?.ndcc_reference_version !== '2'
      : metadata.ndcc_payment_reference !== payment.payment_reference
        || metadata.item_number !== payment.payment_reference)
  )) {
    return NextResponse.json({ error: 'Payment reference mismatch.' }, { status: 500 });
  }

  if (!['pending', 'failed', 'settled'].includes(payment.status)) {
    return NextResponse.json({ error: 'Payment ledger state conflict.' }, { status: 500 });
  }

  if (order.order_category === 'kitchen' && order.meal_collection_window != null
    && !mealContractMatches(order, payment.metadata || {})) {
    return NextResponse.json({ error: 'Meal payment ledger contract mismatch.' }, { status: 409 });
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
