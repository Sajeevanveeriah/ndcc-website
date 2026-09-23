import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { enforceRateLimit, enforceTurnstile, getClientIp } from '@/lib/server/request-guards';
import { getPublicRaffleCampaign } from '@/lib/raffle-visibility';
import { isCheckoutEnabled } from '@/lib/payments/payment-config';
import { generateUniquePaymentReference } from '@/lib/payments/reference';
import { getCheckoutSiteUrl } from '@/lib/payments/site-url';
import { buildPaymentCheckoutSessionParams, createPaymentCheckoutSession } from '@/lib/payments/stripe-checkout';
import {
  PUBLIC_ORDER_LIMITS,
  REVERSE_RAFFLE_HOLD_LIMITS,
  readLimitedJsonObject,
  reverseRaffleHoldAllowed,
  sumPendingRaffleQuantities,
  validateRaffleCheckoutInput,
} from '@/lib/order-input-validation';
import { validateEmail, validatePhone } from '@/lib/utils';
import { validReverseRaffleSelection } from '@/lib/reverse-raffle-selection';

export const dynamic = 'force-dynamic';

const HOLD_LIMIT_MESSAGE = 'You already have raffle numbers held in an unfinished checkout. Complete that payment or wait about 35 minutes for it to expire, then try again.';

// Takes one token per requested number from a per-IP bucket that lasts as
// long as a checkout hold, so one address cannot lock up the draw.
async function takeReverseRaffleIpHold(ip: string, quantity: number) {
  const windowMs = REVERSE_RAFFLE_HOLD_LIMITS.checkoutExpiryMinutes * 60_000;
  const permits = await Promise.all(Array.from({ length: quantity }, () => (
    enforceRateLimit(`raffle-hold-ip:${ip}`, REVERSE_RAFFLE_HOLD_LIMITS.maxHeldNumbersPerIp, windowMs)
  )));
  return permits.every(Boolean);
}

export async function POST(request: Request) {
  let pendingOrderId: string | null = null;
  let createdSessionId: string | null = null;
  let checkoutPublished = false;
  try {
    const ip = getClientIp(request);
    if (!await enforceRateLimit(`raffle:${ip}`, 8, 60_000)) return NextResponse.json({ error: 'Too many attempts. Please wait and try again.' }, { status: 429 });
    if (!isCheckoutEnabled()) return NextResponse.json({ error: 'Card payments are not currently enabled.' }, { status: 503 });
    const rawBody = await readLimitedJsonObject(request, 16 * 1024);
    if (!rawBody.ok) {
      return NextResponse.json(
        { error: rawBody.error },
        { status: rawBody.error === 'Request body is too large.' ? 413 : 400 },
      );
    }
    // Optional Cloudflare Turnstile check; a no-op unless TURNSTILE_SECRET_KEY is set.
    if (!await enforceTurnstile(request, rawBody.value)) {
      return NextResponse.json({ error: 'Please complete the security check and try again.' }, { status: 403 });
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
    const campaignCode = new URL(request.url).searchParams.get('campaign') || 'NDCCRAF';
    if (!['NDCCRAF', 'NDCCRRO'].includes(campaignCode)) return NextResponse.json({ error: 'Unknown raffle.' }, { status: 400 });
    const selectedNumbers = rawBody.value.selectedNumbers;
    if (campaignCode === 'NDCCRRO' && !validReverseRaffleSelection(selectedNumbers, quantity)) {
      return NextResponse.json({ error: 'Choose one different number between 201 and 300 for each ticket.' }, { status: 400 });
    }
    const campaign = await getPublicRaffleCampaign(campaignCode);
    if (!campaign) return NextResponse.json({ error: 'The raffle is not currently available.' }, { status: 503 });
    const returnPath = campaign.code === 'NDCCRRO' ? '/reverse-raffle' : '/raffle';
    const amount = campaign.price_cents * quantity;
    if (!Number.isSafeInteger(campaign.price_cents) || campaign.price_cents <= 0
      || !Number.isSafeInteger(amount) || amount > PUBLIC_ORDER_LIMITS.maximumOrderCents) {
      return NextResponse.json({ error: 'Raffle pricing is unavailable.' }, { status: 503 });
    }
    if (campaign.code === 'NDCCRRO') {
      // Cap unpaid number holds per buyer email (pending orders still inside
      // the checkout-expiry window) and per client IP.
      const holdCutoff = new Date(Date.now() - REVERSE_RAFFLE_HOLD_LIMITS.holdWindowMs).toISOString();
      const { data: pendingRows, error: pendingError } = await db.from('raffle_orders')
        .select('quantity')
        .eq('campaign_id', campaign.id)
        .eq('status', 'pending_payment')
        .eq('customer_email', email)
        .gte('created_at', holdCutoff);
      const pendingForEmail = pendingError ? null : sumPendingRaffleQuantities(pendingRows);
      if (pendingForEmail === null) {
        console.error('Reverse raffle hold lookup failed:', pendingError);
        return NextResponse.json({ error: 'Ticket availability could not be checked. Please try again.' }, { status: 503 });
      }
      if (!reverseRaffleHoldAllowed(pendingForEmail, quantity, REVERSE_RAFFLE_HOLD_LIMITS.maxPendingNumbersPerEmail)) {
        return NextResponse.json({ error: HOLD_LIMIT_MESSAGE }, { status: 429 });
      }
      if (!await takeReverseRaffleIpHold(ip, quantity)) {
        return NextResponse.json({ error: HOLD_LIMIT_MESSAGE }, { status: 429 });
      }
    }
    const paymentReference = await generateUniquePaymentReference('raffle');
    const { data: order, error: orderError } = await db.from('raffle_orders').insert({ campaign_id: campaign.id, customer_name: name, customer_email: email, customer_phone: phone || null, quantity, amount_cents: amount, payment_reference: paymentReference,
      ...(campaignCode === 'NDCCRRO' ? { selected_ticket_numbers: selectedNumbers } : {}),
    }).select('id').single();
    if (orderError?.message?.includes('Reverse raffle number unavailable')) return NextResponse.json({ error: 'One or more selected numbers are now sold or held by another checkout. Please choose again.' }, { status: 409 });
    if (orderError?.message?.includes('Reverse raffle allocation unavailable')) return NextResponse.json({ error: 'There are not enough tickets available. Tickets may be sold or held by another checkout. Please reduce the quantity or try again later.' }, { status: 409 });
    if (orderError || !order) return NextResponse.json({ error: 'The raffle order could not be created.' }, { status: 500 });
    if (campaign.code === 'NDCCRRO') pendingOrderId = order.id;
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
    const session = await createPaymentCheckoutSession(getStripe(), buildPaymentCheckoutSessionParams({ customer_email: email,
      ...(campaign.code === 'NDCCRRO' ? { expires_at: Math.floor(Date.now() / 1000) + 35 * 60 } : {}),
      line_items: [{ price_data: { currency: 'aud', unit_amount: campaign.price_cents, product_data: { name: `NDCC ${campaign.name} Ticket - ${paymentReference}`, ...(campaign.draw_label ? { description: campaign.draw_label } : {}) } }, quantity }],
      success_url: `${site}${returnPath}?payment=success`, cancel_url: `${site}${returnPath}?payment=cancelled`, client_reference_id: paymentReference,
      metadata: paymentMetadata,
      payment_intent_data: { description: `${paymentReference} - NDCC raffle`, metadata: paymentMetadata },
    }), `raffle-${order.id}`);
    createdSessionId = session.id;
    if (session.status !== 'open' || !session.url
      || session.metadata?.ndcc_payment_reference !== paymentReference
      || session.metadata?.item_number !== paymentReference
      || session.metadata?.ndcc_order_id !== order.id
      || session.client_reference_id !== paymentReference) {
      return NextResponse.json({ error: 'The raffle payment reference could not be verified.' }, { status: 502 });
    }
    const linked = await db.from('raffle_orders').update({ stripe_checkout_session_id: session.id }).eq('id', order.id).select('id').maybeSingle();
    if (linked.error || !linked.data) {
      return NextResponse.json({ error: 'The raffle payment record could not be prepared.' }, { status: 503 });
    }
    checkoutPublished = true;
    return NextResponse.json({ checkout_url: session.url, payment_reference: paymentReference });
  } catch (error) {
    console.error('Raffle checkout failed:', error);
    return NextResponse.json({ error: 'Secure checkout could not be started.' }, { status: 500 });
  } finally {
    // No checkout URL has reached the buyer on these setup failures. Expire a
    // known session before releasing its reservation; preserve stock if Stripe
    // cannot confirm expiry, so a payable session can never oversell the draw.
    if (pendingOrderId && !checkoutPublished) {
      try {
        const expired = createdSessionId
          ? await getStripe().checkout.sessions.expire(createdSessionId)
          : null;
        if (!createdSessionId || expired?.status === 'expired') {
          const released = await createServerClient().from('raffle_orders')
            .update({ status: 'cancelled' }).eq('id', pendingOrderId).eq('status', 'pending_payment');
          if (released.error) console.error('Raffle reservation release failed:', released.error);
        }
      } catch (cleanupError) {
        console.error('Raffle checkout cleanup requires reconciliation:', cleanupError);
      }
    }
  }
}
