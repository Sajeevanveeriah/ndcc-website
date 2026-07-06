import { createServerClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

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

        // Only mark paid when Stripe says the session is actually paid.
        // checkout.session.completed also fires for async payment methods
        // that have not settled yet (payment_status 'unpaid'/'no_payment_required').
        if (session.payment_status !== 'paid') {
          console.warn(
            `Webhook: checkout.session.completed for order ${orderId} with payment_status "${session.payment_status}"; not marking paid.`
          );
          return NextResponse.json({ received: true });
        }

        const { data: order, error: fetchError } = await supabase
          .from('orders')
          .select('id,total_amount')
          .eq('id', orderId)
          .maybeSingle();

        if (fetchError || !order) {
          console.error('Webhook: failed to load order for verification:', fetchError || 'order not found');
          return NextResponse.json({ received: true });
        }

        // Compare the amount Stripe actually charged (cents) with the stored
        // order total. On mismatch, flag for manual review instead of paid.
        const expectedCents = Math.round(Number(order.total_amount) * 100);
        const chargedCents = session.amount_total;

        if (typeof chargedCents === 'number' && chargedCents !== expectedCents) {
          const { error: reviewError } = await supabase
            .from('orders')
            .update({
              needs_review_reason: `Stripe amount mismatch: charged ${chargedCents} cents but order total is ${expectedCents} cents (session ${session.id})`,
            })
            .eq('id', orderId);
          if (reviewError) {
            console.error('Webhook: failed to flag order for review:', reviewError);
          }
          return NextResponse.json({ received: true });
        }

        const { error } = await supabase
          .from('orders')
          .update({ payment_status: 'paid' })
          .eq('id', orderId);

        if (error) {
          console.error('Failed to update order payment status:', error);
        }
      } catch (err) {
        console.error('Webhook handler error:', err);
      }
    }
  }

  return NextResponse.json({ received: true });
}
