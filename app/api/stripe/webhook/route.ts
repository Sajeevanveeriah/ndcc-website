import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createServerClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { isPaymentTestMode } from '@/lib/payments/payment-config';
import { getCheckoutEventAction } from '@/lib/payments/stripe-checkout';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LedgerRow = {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  provider_event_id: string | null;
  metadata: Record<string, unknown> | null;
};

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  if (typeof session.payment_intent === 'string') return session.payment_intent;
  return session.payment_intent?.id || null;
}

function cents(amount: number): number {
  return Math.round(Number(amount) * 100);
}

function isDuplicateError(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === '23505' || /duplicate key/i.test(error.message || '')));
}

async function markSessionFailed(
  session: Stripe.Checkout.Session,
  event: Stripe.Event
) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('order_payments')
    .update({
      status: 'failed',
      provider_event_id: event.id,
    })
    .eq('provider', 'stripe')
    .eq('provider_reference', session.id)
    .eq('status', 'pending');

  if (error) {
    console.error(`Webhook: failed to mark Stripe session ${session.id} as failed:`, error);
    return NextResponse.json({ error: 'Failed to update payment attempt.' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

async function settleSession(session: Stripe.Checkout.Session, event: Stripe.Event) {
  const orderId = session.metadata?.order_id;
  if (!orderId || !UUID_PATTERN.test(orderId)) {
    console.warn(`Webhook: Stripe session ${session.id} is not linked to a valid NDCC order; ignored.`);
    return NextResponse.json({ received: true, ignored: true });
  }

  if (session.payment_status !== 'paid') {
    console.warn(`Webhook: settlement event ${event.id} has payment_status ${session.payment_status}; waiting.`);
    return NextResponse.json({ received: true, pending: true });
  }

  const amountCents = typeof session.amount_total === 'number' ? session.amount_total : 0;
  if (amountCents <= 0 || (session.currency || '').toLowerCase() !== 'aud') {
    console.error(`Webhook: Stripe session ${session.id} has an invalid AUD settlement amount.`);
    return NextResponse.json({ error: 'Invalid settlement amount.' }, { status: 500 });
  }

  const expectedAmountCents = Number(session.metadata?.expected_amount_cents || amountCents);
  if (!Number.isInteger(expectedAmountCents) || expectedAmountCents !== amountCents) {
    console.error(`Webhook: Stripe session ${session.id} amount does not match its signed metadata.`);
    return NextResponse.json({ error: 'Payment amount mismatch.' }, { status: 500 });
  }

  const supabase = createServerClient();
  const { data: existing, error: existingError } = await supabase
    .from('order_payments')
    .select('id,order_id,amount,status,provider_event_id,metadata')
    .eq('provider', 'stripe')
    .eq('provider_reference', session.id)
    .maybeSingle();

  if (existingError) {
    console.error('Webhook: failed to load the pending Stripe ledger row:', existingError);
    return NextResponse.json({ error: 'Payment ledger unavailable.' }, { status: 500 });
  }

  const payment = existing as LedgerRow | null;
  if (payment) {
    if (payment.order_id !== orderId || cents(payment.amount) !== amountCents) {
      console.error(`Webhook: Stripe session ${session.id} does not match its pending ledger row.`);
      return NextResponse.json({ error: 'Payment ledger mismatch.' }, { status: 500 });
    }
    if (payment.status === 'settled') {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (payment.status !== 'pending' && payment.status !== 'failed') {
      console.error(`Webhook: Stripe session ${session.id} has non-settleable ledger status ${payment.status}.`);
      return NextResponse.json({ error: 'Payment ledger state conflict.' }, { status: 500 });
    }

    const { data: settled, error: settleError } = await supabase
      .from('order_payments')
      .update({
        status: 'settled',
        provider_event_id: event.id,
        received_at: new Date(event.created * 1000).toISOString(),
        recorded_by: 'stripe-webhook',
        metadata: {
          ...(payment.metadata || {}),
          payment_intent: paymentIntentId(session),
          settlement_event_type: event.type,
        },
      })
      .eq('id', payment.id)
      .eq('status', payment.status)
      .select('id')
      .maybeSingle();

    if (isDuplicateError(settleError)) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (settleError) {
      console.error('Webhook: failed to settle the pending Stripe ledger row:', settleError);
      return NextResponse.json({ error: 'Failed to record payment.' }, { status: 500 });
    }
    if (!settled) {
      const { data: concurrent } = await supabase
        .from('order_payments')
        .select('status')
        .eq('id', payment.id)
        .maybeSingle();
      if (concurrent?.status === 'settled') {
        return NextResponse.json({ received: true, duplicate: true });
      }
      return NextResponse.json({ error: 'Concurrent payment update conflict.' }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  }

  // Compatibility for a Checkout Session created by the previous route,
  // before pending Stripe attempts were added to the ledger.
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id,payment_reference')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError || !order) {
    console.error(`Webhook: order ${orderId} for legacy Stripe session ${session.id} was not found.`, orderError);
    return NextResponse.json({ error: 'Order not found.' }, { status: 500 });
  }
  if (session.client_reference_id && session.client_reference_id !== orderId) {
    return NextResponse.json({ error: 'Checkout order reference mismatch.' }, { status: 500 });
  }
  if (session.metadata?.payment_reference && session.metadata.payment_reference !== order.payment_reference) {
    return NextResponse.json({ error: 'Checkout payment reference mismatch.' }, { status: 500 });
  }

  const { error: insertError } = await supabase.from('order_payments').insert({
    order_id: orderId,
    amount: amountCents / 100,
    currency: 'AUD',
    method: 'stripe',
    provider: 'stripe',
    provider_reference: session.id,
    provider_event_id: event.id,
    status: 'settled',
    received_at: new Date(event.created * 1000).toISOString(),
    recorded_by: 'stripe-webhook-legacy',
    metadata: {
      payment_intent: paymentIntentId(session),
      payment_kind: session.metadata?.payment_kind || 'balance',
      payment_reference: session.metadata?.payment_reference || null,
      settlement_event_type: event.type,
    },
  });

  if (isDuplicateError(insertError)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (insertError) {
    console.error('Webhook: failed to record the legacy Stripe payment:', insertError);
    return NextResponse.json({ error: 'Failed to record payment.' }, { status: 500 });
  }
  return NextResponse.json({ received: true, legacy: true });
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  if (event.livemode === isPaymentTestMode()) {
    console.error(`Webhook: event ${event.id} mode does not match PAYMENT_TEST_MODE.`);
    return NextResponse.json({ error: 'Webhook mode mismatch.' }, { status: 400 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const action = getCheckoutEventAction(event.type, session.payment_status);
  if (action === 'ignore') return NextResponse.json({ received: true, ignored: true });
  if (action === 'pending') return NextResponse.json({ received: true, pending: true });
  if (action === 'fail') return markSessionFailed(session, event);
  return settleSession(session, event);
}
