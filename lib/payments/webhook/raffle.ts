import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createServerClient } from '@/lib/supabase-server';
import { isUuidV1ToV5 } from '@/lib/validation/uuid';
import { isCanonicalPaymentReference } from '@/lib/payments/reference';
import {
  ensureLegacyReference,
  isCleanLegacyContract,
  paymentIntentId,
  queueAndAttemptReceipt,
  replayDeferredFinancialEvents,
  upgradeLegacyPaymentIntent,
} from './shared';

// Raffle Checkout Sessions (metadata.product === 'NDCC Raffle').

export async function handleRaffleCheckout(event: Stripe.Event): Promise<NextResponse | null> {
  if (!event.type.startsWith('checkout.session.')) return null;
  const session = event.data.object as Stripe.Checkout.Session;
  const metadata = (session.metadata || {}) as Record<string, string>;
  if (metadata.product !== 'NDCC Raffle') return null;
  const orderId = metadata.raffle_order_id;
  if (!orderId || !isUuidV1ToV5(orderId)) {
    return NextResponse.json({ error: 'Invalid raffle order metadata.' }, { status: 400 });
  }
  // Only a signed provider expiry releases stock, never a browser cancellation or clock timeout.
  if (event.type === 'checkout.session.expired' && session.status === 'expired' && session.payment_status === 'unpaid') {
    if (!/^cs_[a-zA-Z0-9_]+$/.test(session.id)) return NextResponse.json({ error: 'Invalid session.' }, { status: 400 });
    const expired = await createServerClient().from('raffle_orders').update({ status: 'cancelled' })
      .eq('id', orderId).or(`stripe_checkout_session_id.eq.${session.id},stripe_checkout_session_id.is.null`)
      .eq('payment_reference', metadata.ndcc_payment_reference).eq('status', 'pending_payment');
    if (expired.error) return NextResponse.json({ error: 'Raffle checkout expiry could not be recorded.' }, { status: 500 });
    return NextResponse.json({ received: true, raffle: true, expired: true });
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
