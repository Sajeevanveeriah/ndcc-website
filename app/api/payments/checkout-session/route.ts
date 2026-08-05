import { NextResponse } from 'next/server';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { deriveCapabilities, loadMerchPaymentSettings } from '@/lib/payments/capabilities';
import { validatePaymentRequest } from '@/lib/payments/partial';
import { buildCheckoutIdempotencyKey } from '@/lib/payments/stripe-checkout';

export const dynamic = 'force-dynamic';

// Creates a Stripe Checkout session for an EXISTING order — either the full
// balance or a validated part payment. The order itself is always created
// through /api/orders first (which issues the bank-transfer payment
// reference), so card payment is a strictly optional extra step and every
// order keeps its reference.
//
// The settled payment is recorded ONLY by the Stripe webhook
// (/api/stripe/webhook); the browser redirect never marks anything paid.
export async function POST(request: Request) {
  try {
    if (!isServerSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Service not configured.' }, { status: 503 });
    }

    const ip = getClientIp(request);
    if (!enforceRateLimit(`pay-session:${ip}`, 10, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many payment attempts. Please wait and try again.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const orderId = typeof body.order_id === 'string' ? body.order_id.trim() : '';
    const requestedAmount = body.amount === undefined || body.amount === null ? null : Number(body.amount);
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return NextResponse.json({ success: false, error: 'A valid order_id is required.' }, { status: 400 });
    }
    if (requestedAmount !== null && !Number.isFinite(requestedAmount)) {
      return NextResponse.json({ success: false, error: 'Payment amount must be a number.' }, { status: 400 });
    }

    const supabase = createServerClient();
    const settings = await loadMerchPaymentSettings(supabase);
    const capabilities = deriveCapabilities(settings);
    if (!capabilities.card) {
      return NextResponse.json({ success: false, error: 'Card payments are not currently enabled.' }, { status: 503 });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id,total_amount,amount_paid,payment_status,order_status,payment_reference,customer_email')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError || !order) {
      return NextResponse.json({ success: false, error: 'Order not found.' }, { status: 404 });
    }

    const balanceDue = Number(order.total_amount) - Number(order.amount_paid ?? 0);
    const validation = validatePaymentRequest({
      requestedAmount,
      balanceDue,
      minimumPartialAmount: settings.minimum_partial_amount,
      partialPaymentsEnabled: capabilities.partial_payments,
      orderStatus: order.order_status,
      paymentStatus: order.payment_status,
    });
    if (!validation.ok) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const reference = order.payment_reference || order.id;
    const stripe = getStripe();
    const amountPaidCents = Math.round(Number(order.amount_paid ?? 0) * 100);
    const idempotencyKey = buildCheckoutIdempotencyKey({
      orderId: order.id,
      amountPaidCents,
      amountCents: validation.amountCents,
    });
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        client_reference_id: order.id,
        line_items: [
          {
            price_data: {
              currency: 'aud',
              product_data: {
                name: validation.isPartial
                  ? `Part payment - order ${reference}`
                  : `Payment - order ${reference}`,
                description: `Newcomb & District Cricket Club merchandise order ${reference}`,
              },
              unit_amount: validation.amountCents,
            },
            quantity: 1,
          },
        ],
        success_url: `${siteUrl}/merchandise?payment=submitted&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/merchandise?payment=cancelled`,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
        ...(order.customer_email ? { customer_email: order.customer_email } : {}),
        metadata: {
          order_id: order.id,
          payment_reference: reference,
          payment_kind: validation.isPartial ? 'partial' : 'balance',
          expected_amount_cents: String(validation.amountCents),
        },
        payment_intent_data: {
          metadata: {
            order_id: order.id,
            payment_reference: reference,
          },
        },
      },
      { idempotencyKey }
    );

    if (!session.url) {
      return NextResponse.json({ success: false, error: 'Stripe did not return a checkout URL.' }, { status: 502 });
    }

    const { error: pendingPaymentError } = await supabase.from('order_payments').insert({
      order_id: order.id,
      amount: validation.amountCents / 100,
      currency: 'AUD',
      method: 'stripe',
      provider: 'stripe',
      provider_reference: session.id,
      status: 'pending',
      recorded_by: 'stripe-checkout',
      metadata: {
        payment_kind: validation.isPartial ? 'partial' : 'balance',
        payment_reference: reference,
        idempotency_key: idempotencyKey,
      },
    });

    if (pendingPaymentError && pendingPaymentError.code !== '23505') {
      console.error('Checkout-session pending ledger insert failed:', pendingPaymentError);
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expireError) {
        console.error('Checkout-session cleanup failed:', expireError);
      }
      return NextResponse.json(
        { success: false, error: 'Unable to prepare the payment record. Please try again.' },
        { status: 503 }
      );
    }

    const { error: orderUpdateError } = await supabase
      .from('orders')
      .update({ stripe_session_id: session.id })
      .eq('id', order.id);
    if (orderUpdateError) {
      console.error('Checkout-session order link update failed:', orderUpdateError);
    }

    return NextResponse.json({
      success: true,
      checkout_url: session.url,
      amount: validation.amountCents / 100,
    });
  } catch (err) {
    console.error('Checkout-session route error:', err);
    return NextResponse.json({ success: false, error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
