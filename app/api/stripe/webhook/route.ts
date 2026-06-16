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
