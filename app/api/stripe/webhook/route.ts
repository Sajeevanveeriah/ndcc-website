import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { isPaymentTestMode } from '@/lib/payments/payment-config';
import { getCheckoutEventAction } from '@/lib/payments/stripe-checkout';
import { handleFinancialEvent } from '@/lib/payments/webhook/financial';
import { handleDinoCoachCheckout } from '@/lib/payments/webhook/dino';
import { handleRaffleCheckout } from '@/lib/payments/webhook/raffle';
import { markSessionFailed, settleSession } from '@/lib/payments/webhook/orders';

export const dynamic = 'force-dynamic';

// Thin dispatcher: signature + mode verification here, then each payment
// domain's handler in lib/payments/webhook/ in the original order.

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
