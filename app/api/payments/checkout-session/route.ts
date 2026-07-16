import { NextResponse } from 'next/server';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { deriveCapabilities, loadMerchPaymentSettings } from '@/lib/payments/capabilities';
import { validatePaymentRequest } from '@/lib/payments/partial';

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
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'aud',
            product_data: {
              name: validation.isPartial
                ? `Part payment — order ${reference}`
                : `Payment — order ${reference}`,
              description: `Newcomb & District Cricket Club merchandise order ${reference}`,
            },
            unit_amount: validation.amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/merchandise?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/merchandise?cancelled=true`,
      ...(order.customer_email ? { customer_email: order.customer_email } : {}),
      metadata: {
        order_id: order.id,
        payment_reference: reference,
        payment_kind: validation.isPartial ? 'partial' : 'balance',
      },
    });

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
