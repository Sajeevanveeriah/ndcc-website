import { BANK_TRANSFER_HOLD_MS, bankHoldLimitMessage, configuredBankDetails } from '@/lib/payments/bank-transfer';
import { sendBankTransferInstructions } from '@/lib/payments/bank-transfer-email';
import { deriveCapabilities, loadMerchPaymentSettings } from '@/lib/payments/capabilities';
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
import { isWheelCampaignCode } from '@/lib/prize-wheel/rules';
import { wheelCheckoutFailure } from '@/lib/prize-wheel/checkout';

export const dynamic = 'force-dynamic';

const HOLD_LIMIT_MESSAGE = 'You already have raffle numbers held in an unfinished checkout. Complete that payment or wait about 35 minutes for it to expire, then try again.';

type PendingHold = { quantity: number; payment_method?: string | null; payment_reference?: string | null };

// Card holds keep the existing message. When unconfirmed bank-deposit holds
// alone keep the buyer over the cap, explain the 48 hour release instead.
function holdLimitMessage(rows: PendingHold[], requested: number) {
  const bankRows = rows.filter(row => row.payment_method === 'bank_transfer');
  if (!bankRows.length) return HOLD_LIMIT_MESSAGE;
  const cardHeld = sumPendingRaffleQuantities(rows.filter(row => row.payment_method !== 'bank_transfer')) ?? 0;
  if (!reverseRaffleHoldAllowed(cardHeld, requested, REVERSE_RAFFLE_HOLD_LIMITS.maxPendingNumbersPerEmail)) return HOLD_LIMIT_MESSAGE;
  return bankHoldLimitMessage(bankRows.find(row => row.payment_reference)?.payment_reference);
}

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

    const rawBody = await readLimitedJsonObject(request, 16 * 1024);
    if (!rawBody.ok) {
      return NextResponse.json(
        { error: rawBody.error },
        { status: rawBody.error === 'Request body is too large.' ? 413 : 400 },
      );
    }
    const method = rawBody.value.payment_method || 'stripe';
    if (method !== 'stripe' && method !== 'bank_transfer') return NextResponse.json({ error: 'Choose a valid payment method.' }, { status: 400 });
    if (method === 'stripe' && !isCheckoutEnabled()) return NextResponse.json({ error: 'Card payments are not currently enabled.' }, { status: 503 });
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
    if (method === 'stripe' && !site) return NextResponse.json({ error: 'Secure checkout return URLs are not configured.' }, { status: 503 });
    const db = createServerClient();
    const campaignCode = new URL(request.url).searchParams.get('campaign') || 'NDCCRAF';
    // Prize wheel campaigns (NDCCWHL + draw date) use buyer-picked numbers like the reverse raffle.
    const isWheel = isWheelCampaignCode(campaignCode);
    if (!['NDCCRAF', 'NDCCRRO'].includes(campaignCode) && !isWheel) return NextResponse.json({ error: 'Unknown raffle.' }, { status: 400 });
    if (method === 'bank_transfer' && !deriveCapabilities(await loadMerchPaymentSettings(db), campaignCode === 'NDCCRRO' ? 'reverse_raffle' : 'raffle').bank_transfer) return NextResponse.json({ error: 'Bank transfers are currently unavailable.' }, { status: 503 });
    const selectedNumbers = rawBody.value.selectedNumbers;
    if (campaignCode === 'NDCCRRO' && !validReverseRaffleSelection(selectedNumbers, quantity)) {
      return NextResponse.json({ error: 'Choose one different number between 201 and 300 for each ticket.' }, { status: 400 });
    }
    const campaign = await getPublicRaffleCampaign(campaignCode);
    if (!campaign) return NextResponse.json({ error: 'The raffle is not currently available.' }, { status: 503 });
    if (isWheel) {
      const wheelFailure = wheelCheckoutFailure(campaign, rawBody.value, quantity, method);
      if (wheelFailure) return NextResponse.json({ error: wheelFailure.error }, { status: wheelFailure.status });
    }
    const returnPath = campaign.code === 'NDCCRRO' ? '/reverse-raffle' : isWheel ? '/prize-wheel' : '/raffle';
    const amount = campaign.price_cents * quantity;
    if (!Number.isSafeInteger(campaign.price_cents) || campaign.price_cents <= 0
      || !Number.isSafeInteger(amount) || amount > PUBLIC_ORDER_LIMITS.maximumOrderCents) {
      return NextResponse.json({ error: 'Raffle pricing is unavailable.' }, { status: 503 });
    }
    if (campaign.code === 'NDCCRRO' || isWheel) {
      // Cap unpaid number holds per buyer email (card orders still inside the
      // checkout-expiry window, bank deposits inside the 48 hour hold) and per
      // client IP. Expired bank holds no longer reserve numbers.
      const holdCutoff = new Date(Date.now() - REVERSE_RAFFLE_HOLD_LIMITS.holdWindowMs).toISOString();
      const bankHoldCutoff = new Date(Date.now() - BANK_TRANSFER_HOLD_MS).toISOString();
      const { data: pendingRows, error: pendingError } = await db.from('raffle_orders')
        .select('quantity,payment_method,payment_reference')
        .eq('campaign_id', campaign.id)
        .eq('status', 'pending_payment')
        .eq('customer_email', email)
        .or(`bank_transfer_selected_at.gte.${bankHoldCutoff},created_at.gte.${holdCutoff}`);
      const pendingForEmail = pendingError ? null : sumPendingRaffleQuantities(pendingRows);
      if (pendingForEmail === null) {
        console.error('Reverse raffle hold lookup failed:', pendingError);
        return NextResponse.json({ error: 'Ticket availability could not be checked. Please try again.' }, { status: 503 });
      }
      if (!reverseRaffleHoldAllowed(pendingForEmail, quantity, REVERSE_RAFFLE_HOLD_LIMITS.maxPendingNumbersPerEmail)) {
        return NextResponse.json({ error: holdLimitMessage(pendingRows as PendingHold[], quantity) }, { status: 429 });
      }
      if (!await takeReverseRaffleIpHold(ip, quantity)) {
        return NextResponse.json({ error: HOLD_LIMIT_MESSAGE }, { status: 429 });
      }
    }
    const paymentReference = await generateUniquePaymentReference('raffle');
    const { data: order, error: orderError } = await db.from('raffle_orders').insert({ campaign_id: campaign.id, customer_name: name, customer_email: email, customer_phone: phone || null, quantity, amount_cents: amount, payment_reference: paymentReference, payment_method: method, bank_transfer_selected_at: method === 'bank_transfer' ? new Date().toISOString() : null,
      ...(campaignCode === 'NDCCRRO' || isWheel ? { selected_ticket_numbers: selectedNumbers } : {}),
    }).select('id').single();
    if (orderError?.message?.includes('Reverse raffle number unavailable')) return NextResponse.json({ error: 'One or more selected numbers are now sold or held by another checkout. Please choose again.' }, { status: 409 });
    if (orderError?.message?.includes('Prize wheel number unavailable')) return NextResponse.json({ error: 'One or more selected numbers are now sold or held by another checkout. Please choose again.' }, { status: 409 });
    if (orderError?.message?.includes('Prize wheel sales are closed')) return NextResponse.json({ error: 'Online prize wheel sales are closed.' }, { status: 409 });
    if (orderError?.message?.includes('Reverse raffle allocation unavailable')) return NextResponse.json({ error: 'There are not enough tickets available. Tickets may be sold or held by another checkout. Please reduce the quantity or try again later.' }, { status: 409 });
    if (orderError || !order) return NextResponse.json({ error: 'The raffle order could not be created.' }, { status: 500 });
    if (campaign.code === 'NDCCRRO' || isWheel) pendingOrderId = order.id;
    if (method === 'bank_transfer') {
      checkoutPublished = true;
      // Best-effort copy of the on-screen instructions; one message per order.
      let emailed = false;
      try {
        const sent = await sendBankTransferInstructions({ kind: 'raffle', sourceId: order.id, to: email, name, reference: paymentReference, amountCents: amount,
          productLabel: `${campaign.name} tickets`, selectedNumbers: campaign.code === 'NDCCRRO' ? selectedNumbers as number[] : null });
        emailed = sent.status === 'sent';
      } catch (emailError) {
        console.error('Raffle bank deposit instructions email failed:', emailError);
      }
      return NextResponse.json({ success: true, bank_transfer: true, order_id: order.id, total_amount: amount / 100, payment_reference: paymentReference, bank_details: configuredBankDetails(), instructions_emailed: emailed }, { headers: { 'Cache-Control': 'no-store' } });
    }
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
      ...(campaign.code === 'NDCCRRO' || isWheel ? { expires_at: Math.floor(Date.now() / 1000) + 35 * 60 } : {}),
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
