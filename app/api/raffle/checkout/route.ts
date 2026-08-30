import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { getPublicRaffleCampaign } from '@/lib/raffle-visibility';
import { isCheckoutEnabled } from '@/lib/payments/payment-config';
import { generateUniquePaymentReference } from '@/lib/payments/reference';
import { getCheckoutSiteUrl } from '@/lib/payments/site-url';
import {
  PUBLIC_ORDER_LIMITS,
  readLimitedJsonObject,
  validateRaffleCheckoutInput,
} from '@/lib/order-input-validation';
import { validateEmail, validatePhone } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!enforceRateLimit(`raffle:${getClientIp(request)}`, 8, 60_000)) return NextResponse.json({ error: 'Too many attempts. Please wait and try again.' }, { status: 429 });
    if (!isCheckoutEnabled()) return NextResponse.json({ error: 'Card payments are not currently enabled.' }, { status: 503 });
    const rawBody = await readLimitedJsonObject(request, 16 * 1024);
    if (!rawBody.ok) {
      return NextResponse.json(
        { error: rawBody.error },
        { status: rawBody.error === 'Request body is too large.' ? 413 : 400 },
      );
    }
    const parsed = validateRaffleCheckoutInput(rawBody.value);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { name, email, phone, quantity } = parsed.value;
    if (!validateEmail(email) || (phone && !validatePhone(phone))) {
      return NextResponse.json({ error: 'Enter a valid name, email, phone and quantity from 1 to 20.' }, { status: 400 });
    }
    const site = getCheckoutSiteUrl(request);
    if (!site) return NextResponse.json({ error: 'Secure checkout return URLs are not configured.' }, { status: 503 });
    const db = createServerClient();
    const campaign = await getPublicRaffleCampaign();
    if (!campaign) return NextResponse.json({ error: 'The raffle is not currently available.' }, { status: 503 });
    const amount = campaign.price_cents * quantity;
    if (!Number.isSafeInteger(campaign.price_cents) || campaign.price_cents <= 0
      || !Number.isSafeInteger(amount) || amount > PUBLIC_ORDER_LIMITS.maximumOrderCents) {
      return NextResponse.json({ error: 'Raffle pricing is unavailable.' }, { status: 503 });
    }
    const paymentReference = await generateUniquePaymentReference('raffle');
    const { data: order, error: orderError } = await db.from('raffle_orders').insert({ campaign_id: campaign.id, customer_name: name, customer_email: email, customer_phone: phone || null, quantity, amount_cents: amount, payment_reference: paymentReference }).select('id').single();
    if (orderError || !order) return NextResponse.json({ error: 'The raffle order could not be created.' }, { status: 500 });
    const paymentMetadata = {
      ndcc_payment_reference: paymentReference,
      ndcc_payment_type: 'raffle',
      ndcc_order_id: order.id,
      ndcc_reference_version: '1',
      item_number: paymentReference,
      product: 'NDCC Raffle',
      raffle_order_id: order.id,
      expected_amount_cents: String(amount),
      quantity: String(quantity),
      payment_reference: paymentReference,
    };
    const session = await getStripe().checkout.sessions.create({ mode: 'payment', customer_email: email,
      line_items: [{ price_data: { currency: 'aud', unit_amount: campaign.price_cents, product_data: { name: `NDCC Dinos Trailer Raffle Ticket - ${paymentReference}`, description: 'Drawn 19 December 2026 at the Christmas Party' } }, quantity }],
      success_url: `${site}/raffle?payment=success`, cancel_url: `${site}/raffle?payment=cancelled`, client_reference_id: paymentReference,
      metadata: paymentMetadata,
      payment_intent_data: { description: `${paymentReference} - NDCC raffle`, metadata: paymentMetadata },
    }, { idempotencyKey: `raffle-${order.id}` });
    if (session.status !== 'open' || !session.url
      || session.metadata?.ndcc_payment_reference !== paymentReference
      || session.metadata?.item_number !== paymentReference
      || session.metadata?.ndcc_order_id !== order.id
      || session.client_reference_id !== paymentReference) {
      return NextResponse.json({ error: 'The raffle payment reference could not be verified.' }, { status: 502 });
    }
    const linked = await db.from('raffle_orders').update({ stripe_checkout_session_id: session.id }).eq('id', order.id).select('id').maybeSingle();
    if (linked.error || !linked.data) {
      await getStripe().checkout.sessions.expire(session.id).catch(() => undefined);
      return NextResponse.json({ error: 'The raffle payment record could not be prepared.' }, { status: 503 });
    }
    return NextResponse.json({ checkout_url: session.url, payment_reference: paymentReference });
  } catch (error) {
    console.error('Raffle checkout failed:', error);
    return NextResponse.json({ error: 'Secure checkout could not be started.' }, { status: 500 });
  }
}
