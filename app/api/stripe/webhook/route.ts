import { createServerClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Stripe webhook — the ONLY place a card payment becomes a settled ledger
// row. Browser redirects never mark anything paid.
//
// Idempotency: the ledger row carries provider_event_id = event.id, which
// has a partial unique index; a redelivered event hits the conflict and is
// acknowledged without a second row. Order totals/status are derived by the
// order_payments_apply_totals trigger, which locks the order row so
// concurrent deliveries serialise.
export async function POST(request: Request) {
  const sig = request.headers.get('stripe-signature');

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Webhook not configured.' },
      { status: 400 }
    );
  }

  let event;

  try {
    const body = await request.text();
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json(
      { error: 'Invalid signature.' },
      { status: 400 }
    );
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata?.order_id;

    if (orderId) {
      try {
        const supabase = createServerClient();

        // Only record settled money when Stripe says the session is actually
        // paid. checkout.session.completed also fires for async payment
        // methods that have not settled yet.
        if (session.payment_status !== 'paid') {
          console.warn(
            `Webhook: checkout.session.completed for order ${orderId} with payment_status "${session.payment_status}"; not recording payment.`
          );
          return NextResponse.json({ received: true });
        }

        const amountCents = typeof session.amount_total === 'number' ? session.amount_total : 0;
        if (amountCents <= 0) {
          console.error(`Webhook: session ${session.id} for order ${orderId} has no positive amount_total; not recording.`);
          return NextResponse.json({ received: true });
        }

        const { error } = await supabase.from('order_payments').insert({
          order_id: orderId,
          amount: amountCents / 100,
          currency: 'AUD',
          method: 'stripe',
          provider: 'stripe',
          provider_reference: session.id,
          provider_event_id: event.id,
          status: 'settled',
          received_at: new Date().toISOString(),
          recorded_by: 'stripe-webhook',
          metadata: {
            payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
            payment_kind: session.metadata?.payment_kind || 'balance',
            payment_reference: session.metadata?.payment_reference || null,
          },
        });

        if (error) {
          // 23505 = unique violation on provider_event_id: a redelivered
          // event we have already recorded. Acknowledge it.
          if (error.code === '23505' || /duplicate key/i.test(error.message || '')) {
            console.warn(`Webhook: duplicate delivery of ${event.id} ignored.`);
            return NextResponse.json({ received: true, duplicate: true });
          }
          // Ledger table not yet migrated: fall back to the legacy direct
          // status update so payments are never dropped mid-rollout.
          if (/order_payments/.test(error.message || '') && /does not exist|schema cache/i.test(error.message || '')) {
            console.error('Webhook: order_payments table missing; applying legacy payment_status update.');
            await supabase.from('orders').update({ payment_status: 'paid' }).eq('id', orderId);
            return NextResponse.json({ received: true, legacy: true });
          }
          console.error('Webhook: failed to record payment:', error);
          // Non-2xx so Stripe retries a transient failure.
          return NextResponse.json({ error: 'Failed to record payment.' }, { status: 500 });
        }
      } catch (err) {
        console.error('Webhook handler error:', err);
        return NextResponse.json({ error: 'Webhook handler error.' }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
