import { NextResponse } from 'next/server';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { deriveCapabilities, loadMerchPaymentSettings } from '@/lib/payments/capabilities';
import { validatePaymentRequest } from '@/lib/payments/partial';
import { buildCheckoutIdempotencyKey } from '@/lib/payments/stripe-checkout';
import {
  generateUniquePaymentReference,
  isCanonicalPaymentReference,
  normalisePaymentReferenceCategory,
} from '@/lib/payments/reference';
import { getCheckoutSiteUrl } from '@/lib/payments/site-url';
import { readLimitedJsonObject } from '@/lib/order-input-validation';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ORDER_CATEGORY_LABELS: Record<string, string> = {
  merch: 'merchandise order',
  kitchen: 'kitchen order',
  membership: 'social membership',
  event: 'event registration',
};

const CATEGORY_RETURN_PATHS: Record<string, string> = {
  merch: '/merchandise',
  kitchen: '/kitchen',
  membership: '/join',
  event: '/events',
};

const CHECKOUT_DURATION_SECONDS = 60 * 60;
const UNLINKED_EXPIRY_GRACE_SECONDS = 5 * 60;
const LEGACY_UNLINKED_HOLD_MILLISECONDS = 2 * 60 * 60 * 1000;

type FrozenCheckoutContract = {
  origin: string;
  returnPath: string;
  createdAtUnix: number;
  expiresAtUnix: number;
  customerEmail: string;
  orderReference: string;
  orderCategory: string;
};

function getSafeReturnPath(value: unknown, orderCategory: string): string {
  const fallback = CATEGORY_RETURN_PATHS[orderCategory] || '/merchandise';
  if (typeof value !== 'string') return fallback;

  const path = value.trim();
  if (path === '/merchandise' || path === '/kitchen' || path === '/join' || path === '/events') {
    return path;
  }
  if (/^\/events\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(path)) {
    return path;
  }
  return fallback;
}

function metadataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function integerMetadata(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function readFrozenCheckoutContract(
  metadataValue: unknown,
  expected: {
    paymentReference: string;
    paymentCategory: ReturnType<typeof normalisePaymentReferenceCategory>;
    orderCategory: string;
    paymentKind: 'partial' | 'balance';
    amountCents: number;
    origin: string;
  },
): FrozenCheckoutContract | null {
  const metadata = metadataRecord(metadataValue);
  if (!metadata || metadata.checkout_contract_version !== '1') return null;

  const createdAtUnix = integerMetadata(metadata.checkout_created_at_unix);
  const expiresAtUnix = integerMetadata(metadata.checkout_expires_at_unix);
  const origin = typeof metadata.checkout_origin === 'string' ? metadata.checkout_origin : '';
  const returnPath = typeof metadata.checkout_return_path === 'string'
    ? metadata.checkout_return_path
    : '';
  const customerEmail = typeof metadata.checkout_customer_email === 'string'
    ? metadata.checkout_customer_email
    : '';
  const orderReference = typeof metadata.checkout_order_reference === 'string'
    ? metadata.checkout_order_reference
    : '';
  const orderCategory = typeof metadata.order_category === 'string'
    ? metadata.order_category.toLowerCase()
    : '';

  if (createdAtUnix === null || expiresAtUnix === null
    || expiresAtUnix - createdAtUnix !== CHECKOUT_DURATION_SECONDS
    || origin !== expected.origin
    || returnPath !== getSafeReturnPath(returnPath, orderCategory)
    || orderCategory !== expected.orderCategory
    || normalisePaymentReferenceCategory(orderCategory) !== expected.paymentCategory
    || metadata.payment_reference !== expected.paymentReference
    || metadata.item_number !== expected.paymentReference
    || metadata.payment_kind !== expected.paymentKind
    || integerMetadata(metadata.expected_amount_cents) !== expected.amountCents
    || !orderReference
    || customerEmail.length > 254) {
    return null;
  }

  return {
    origin,
    returnPath,
    createdAtUnix,
    expiresAtUnix,
    customerEmail,
    orderReference,
    orderCategory,
  };
}

function unlinkedReservationReleaseAt(
  metadataValue: unknown,
  createdAt: unknown,
): number | null {
  const metadata = metadataRecord(metadataValue);
  const expiresAtUnix = integerMetadata(metadata?.checkout_expires_at_unix);
  const createdAtMilliseconds = new Date(String(createdAt || '')).getTime();
  if (expiresAtUnix !== null) {
    if (!Number.isFinite(createdAtMilliseconds)) return null;
    return Math.max(
      (expiresAtUnix + UNLINKED_EXPIRY_GRACE_SECONDS) * 1000,
      createdAtMilliseconds
        + (CHECKOUT_DURATION_SECONDS + UNLINKED_EXPIRY_GRACE_SECONDS) * 1000,
    );
  }
  return Number.isFinite(createdAtMilliseconds)
    ? createdAtMilliseconds + LEGACY_UNLINKED_HOLD_MILLISECONDS
    : null;
}

// Creates a Stripe Checkout session for an existing order, either the full
// balance or a validated part payment. The order itself is always created
// through an approved server route first, so every payment keeps an auditable
// NDCC order and payment reference.
//
// The settled payment is recorded only by the Stripe webhook
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

    const rawBody = await readLimitedJsonObject(request, 8 * 1024);
    if (!rawBody.ok) {
      const status = rawBody.error === 'Request body is too large.' ? 413 : 400;
      return NextResponse.json({ success: false, error: rawBody.error }, { status });
    }
    const body = rawBody.value;
    const orderId = typeof body.order_id === 'string' ? body.order_id.trim() : '';
    let requestedAmount: number | null = null;
    if (!UUID_PATTERN.test(orderId)) {
      return NextResponse.json({ success: false, error: 'A valid order_id is required.' }, { status: 400 });
    }
    if (body.amount !== undefined && body.amount !== null) {
      if (typeof body.amount !== 'number' || !Number.isFinite(body.amount)) {
        return NextResponse.json({ success: false, error: 'Payment amount must be a number.' }, { status: 400 });
      }
      requestedAmount = body.amount;
    }

    const supabase = createServerClient();
    const settings = await loadMerchPaymentSettings(supabase);
    const capabilities = deriveCapabilities(settings);
    if (!capabilities.card) {
      return NextResponse.json({ success: false, error: 'Card payments are not currently enabled.' }, { status: 503 });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id,total_amount,amount_paid,payment_status,order_status,payment_reference,customer_email,order_category')
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

    const siteUrl = getCheckoutSiteUrl(request);
    if (!siteUrl) {
      return NextResponse.json({ success: false, error: 'Secure checkout return URLs are not configured.' }, { status: 503 });
    }
    const orderCategory = String(order.order_category || 'general').toLowerCase();
    const returnPath = getSafeReturnPath(body.return_path, orderCategory);
    const orderReference = order.payment_reference || order.id;
    const paymentCategory = normalisePaymentReferenceCategory(orderCategory);
    const paymentKind: 'partial' | 'balance' = validation.isPartial ? 'partial' : 'balance';
    const stripe = getStripe();
    const { data: previousAttempts, error: attemptsError } = await supabase
      .from('order_payments')
      .select('id,amount,currency,status,provider_reference,payment_reference,metadata,created_at')
      .eq('order_id', order.id)
      .eq('provider', 'stripe')
      .order('created_at', { ascending: false });
    if (attemptsError) {
      return NextResponse.json({ success: false, error: 'Payment attempts could not be verified.' }, { status: 503 });
    }
    // Reconcile every linked reservation, not only one with the requested
    // amount. Otherwise an expired Session for a different amount can keep
    // part (or all) of the order balance reserved forever.
    let reusableAttempt: { id: string; paymentReference: string; checkoutUrl: string } | null = null;
    let reusableUnlinkedAttempt: {
      id: string;
      paymentReference: string;
      contract: FrozenCheckoutContract;
    } | null = null;
    let settlementPending = false;
    let verificationFailed = false;
    let ledgerReconciliationFailed = false;
    for (const attempt of previousAttempts || []) {
      if (attempt.status !== 'pending') continue;
      const attemptAmountCents = Math.round(Number(attempt.amount) * 100);
      if (!attempt.provider_reference) {
        const releaseAt = unlinkedReservationReleaseAt(attempt.metadata, attempt.created_at);
        if (releaseAt !== null && Date.now() >= releaseAt) {
          const stale = await supabase.from('order_payments')
            .update({ status: 'failed', recorded_by: 'stripe-checkout-unlinked-expiry' })
            .eq('id', attempt.id)
            .eq('status', 'pending')
            .is('provider_reference', null);
          if (stale.error) {
            ledgerReconciliationFailed = true;
          }
          continue;
        }
        const frozenContract = readFrozenCheckoutContract(attempt.metadata, {
          paymentReference: String(attempt.payment_reference || ''),
          paymentCategory,
          orderCategory,
          paymentKind,
          amountCents: validation.amountCents,
          origin: siteUrl,
        });
        if (attemptAmountCents === validation.amountCents
          && isCanonicalPaymentReference(attempt.payment_reference, paymentCategory)
          && frozenContract
          && !reusableUnlinkedAttempt) {
          reusableUnlinkedAttempt = {
            id: attempt.id,
            paymentReference: attempt.payment_reference,
            contract: frozenContract,
          };
        } else if (attemptAmountCents === validation.amountCents) {
          // A reservation without its frozen contract may represent a Session
          // whose response was lost under the previous implementation. Hold
          // the balance until the conservative release time instead of
          // retrying the idempotency key with different parameters.
          verificationFailed = true;
        }
        continue;
      }

      const existingSession = await stripe.checkout.sessions
        .retrieve(attempt.provider_reference)
        .catch(() => null);
      if (!existingSession) {
        // Never release money solely because Stripe is temporarily
        // unavailable: the Session may already be complete. A later request
        // will retry this reconciliation. Continue checking the other linked
        // Sessions so one provider error cannot leave unrelated expired rows
        // behind.
        verificationFailed = true;
        continue;
      }
      if (existingSession.status === 'complete') {
        settlementPending = true;
        continue;
      }
      if (existingSession.status === 'expired') {
        const expired = await supabase.from('order_payments')
          .update({
            status: 'failed',
            recorded_by: 'stripe-checkout-expiry-check',
            metadata: {
              ...(attempt.metadata && typeof attempt.metadata === 'object' ? attempt.metadata : {}),
              checkout_expires_at_unix: String(existingSession.expires_at),
              checkout_expires_at: new Date(existingSession.expires_at * 1000).toISOString(),
              checkout_session_status: 'expired',
            },
          })
          .eq('id', attempt.id)
          .eq('status', 'pending')
          .eq('provider_reference', existingSession.id);
        if (expired.error) {
          ledgerReconciliationFailed = true;
        }
        continue;
      }
      if (existingSession.status !== 'open') {
        verificationFailed = true;
        continue;
      }

      const attemptMetadata = metadataRecord(attempt.metadata);
      const sessionMetadata = existingSession.metadata || {};
      const checkoutCreatedAtUnix = integerMetadata(sessionMetadata.checkout_created_at_unix);
      const linkedContractValid = Boolean(
        existingSession.url
        && existingSession.mode === 'payment'
        && attemptAmountCents > 0
        && String(attempt.currency || '').toUpperCase() === 'AUD'
        && existingSession.amount_total === attemptAmountCents
        && existingSession.currency?.toLowerCase() === 'aud'
        && isCanonicalPaymentReference(attempt.payment_reference, paymentCategory)
        && sessionMetadata.ndcc_reference_version === '1'
        && sessionMetadata.ndcc_payment_reference === attempt.payment_reference
        && sessionMetadata.item_number === attempt.payment_reference
        && sessionMetadata.ndcc_payment_type === paymentCategory
        && sessionMetadata.ndcc_order_id === order.id
        && sessionMetadata.order_id === order.id
        && sessionMetadata.payment_reference === attempt.payment_reference
        && sessionMetadata.expected_amount_cents === String(attemptAmountCents)
        && sessionMetadata.payment_kind === paymentKind
        && attemptMetadata?.payment_kind === paymentKind
        && sessionMetadata.order_category === orderCategory
        && attemptMetadata?.order_category === orderCategory
        && sessionMetadata.checkout_contract_version === '1'
        && attemptMetadata?.checkout_contract_version === '1'
        && checkoutCreatedAtUnix !== null
        && existingSession.expires_at - checkoutCreatedAtUnix === CHECKOUT_DURATION_SECONDS
        && integerMetadata(attemptMetadata?.checkout_created_at_unix) === checkoutCreatedAtUnix
        && integerMetadata(attemptMetadata?.checkout_expires_at_unix) === existingSession.expires_at
        && attemptMetadata?.payment_reference === attempt.payment_reference
        && attemptMetadata?.item_number === attempt.payment_reference
        && integerMetadata(attemptMetadata?.expected_amount_cents) === attemptAmountCents
        && sessionMetadata.checkout_expires_at_unix === String(existingSession.expires_at)
        && existingSession.client_reference_id === attempt.payment_reference
      );
      if (!linkedContractValid) {
        verificationFailed = true;
        continue;
      }

      const persistedExpiry = await supabase.from('order_payments')
        .update({
          metadata: {
            ...(attempt.metadata && typeof attempt.metadata === 'object' ? attempt.metadata : {}),
            checkout_expires_at_unix: String(existingSession.expires_at),
            checkout_expires_at: new Date(existingSession.expires_at * 1000).toISOString(),
            checkout_session_status: 'open',
          },
        })
        .eq('id', attempt.id)
        .eq('status', 'pending')
        .eq('provider_reference', existingSession.id);
      if (persistedExpiry.error) {
        ledgerReconciliationFailed = true;
      }

      if (!reusableAttempt
        && attemptAmountCents === validation.amountCents
        && existingSession.url) {
        reusableAttempt = {
          id: attempt.id,
          paymentReference: attempt.payment_reference,
          checkoutUrl: existingSession.url,
        };
      }
    }

    if (settlementPending) {
      return NextResponse.json(
        { success: false, error: 'A payment is already being confirmed. Please refresh the order before trying again.' },
        { status: 409 }
      );
    }
    if (verificationFailed) {
      return NextResponse.json(
        { success: false, error: 'One or more existing payment attempts could not be verified.' },
        { status: 503 }
      );
    }
    if (ledgerReconciliationFailed) {
      return NextResponse.json(
        { success: false, error: 'One or more existing payment reservations could not be reconciled.' },
        { status: 503 }
      );
    }

    if (reusableAttempt) {
      return NextResponse.json({
        success: true,
        checkout_url: reusableAttempt.checkoutUrl,
        amount: validation.amountCents / 100,
        payment_reference: reusableAttempt.paymentReference,
        reused: true,
      });
    }
    let paymentReference: string;
    let reservationId: string;
    let checkoutContract: FrozenCheckoutContract;
    if (reusableUnlinkedAttempt) {
      paymentReference = reusableUnlinkedAttempt.paymentReference;
      reservationId = reusableUnlinkedAttempt.id;
      checkoutContract = reusableUnlinkedAttempt.contract;
    } else {
      paymentReference = await generateUniquePaymentReference(paymentCategory);
      const reservation = await supabase.rpc('reserve_order_stripe_payment', {
        target_order_id: order.id,
        target_payment_reference: paymentReference,
        target_amount_cents: validation.amountCents,
        target_payment_kind: paymentKind,
        target_checkout_origin: siteUrl,
        target_return_path: returnPath,
      });
      const reserved = reservation.data?.[0];
      const expiresAtUnix = integerMetadata(reserved?.checkout_expires_at_unix);
      if (reservation.error || !reserved?.payment_id || expiresAtUnix === null) {
        return NextResponse.json(
          { success: false, error: 'Another payment attempt has reserved this order balance. Please use or cancel that checkout first.' },
          { status: 409 }
        );
      }
      reservationId = reserved.payment_id;
      checkoutContract = {
        origin: siteUrl,
        returnPath,
        createdAtUnix: expiresAtUnix - CHECKOUT_DURATION_SECONDS,
        expiresAtUnix,
        customerEmail: String(order.customer_email || ''),
        orderReference: String(orderReference),
        orderCategory,
      };
    }
    const checkoutExpiresAtUnix = checkoutContract.expiresAtUnix;
    const checkoutExpiresAt = new Date(checkoutExpiresAtUnix * 1000).toISOString();
    if (checkoutExpiresAtUnix <= Math.floor(Date.now() / 1000) + 30 * 60) {
      return NextResponse.json(
        { success: false, error: 'The reserved checkout window is too close to expiry. Please try again after it is released.' },
        { status: 409 },
      );
    }
    const frozenCategoryLabel = ORDER_CATEGORY_LABELS[checkoutContract.orderCategory] || 'club order';
    const paymentMetadata = {
      ndcc_payment_reference: paymentReference,
      ndcc_payment_type: paymentCategory,
      ndcc_order_id: order.id,
      ndcc_reference_version: '1',
      item_number: paymentReference,
      order_id: order.id,
      order_category: orderCategory,
      payment_reference: paymentReference,
      payment_kind: paymentKind,
      expected_amount_cents: String(validation.amountCents),
      checkout_contract_version: '1',
      checkout_created_at_unix: String(checkoutContract.createdAtUnix),
      checkout_expires_at_unix: String(checkoutExpiresAtUnix),
      checkout_expires_at: checkoutExpiresAt,
    };
    const idempotencyKey = buildCheckoutIdempotencyKey({
      paymentReference,
    });
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        client_reference_id: paymentReference,
        line_items: [
          {
            price_data: {
              currency: 'aud',
              product_data: {
                name: validation.isPartial
                  ? `Part payment - ${paymentReference}`
                  : `Payment - ${paymentReference}`,
                description: `Newcomb & District Cricket Club ${frozenCategoryLabel}; order ${checkoutContract.orderReference}`,
              },
              unit_amount: validation.amountCents,
            },
            quantity: 1,
          },
        ],
        success_url: checkoutContract.returnPath === '/merchandise'
          ? `${checkoutContract.origin}/merchandise?payment=submitted&session_id={CHECKOUT_SESSION_ID}`
          : `${checkoutContract.origin}/payment?status=submitted&return_path=${encodeURIComponent(checkoutContract.returnPath)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: checkoutContract.returnPath === '/merchandise'
          ? `${checkoutContract.origin}/merchandise?payment=cancelled`
          : `${checkoutContract.origin}/payment?status=cancelled&return_path=${encodeURIComponent(checkoutContract.returnPath)}`,
        expires_at: checkoutExpiresAtUnix,
        ...(checkoutContract.customerEmail ? { customer_email: checkoutContract.customerEmail } : {}),
        metadata: paymentMetadata,
        payment_intent_data: {
          description: `${paymentReference} - NDCC ${frozenCategoryLabel}`,
          metadata: paymentMetadata,
        },
      },
      { idempotencyKey }
    );

    // Stripe may return an earlier Session for the same idempotency key. Its
    // metadata, not the newly reserved sequence value, is authoritative.
    const sessionPaymentReference = session.metadata?.ndcc_payment_reference;
    const sessionCreatedAtUnix = integerMetadata(session.metadata?.checkout_created_at_unix);
    const returnedContractInvalid = !isCanonicalPaymentReference(sessionPaymentReference, paymentCategory)
      || sessionPaymentReference !== paymentReference
      || session.metadata?.item_number !== paymentReference
      || session.metadata?.ndcc_reference_version !== '1'
      || session.metadata?.ndcc_payment_type !== paymentCategory
      || session.metadata?.ndcc_order_id !== order.id
      || session.metadata?.order_id !== order.id
      || session.metadata?.payment_reference !== paymentReference
      || session.metadata?.payment_kind !== paymentKind
      || session.metadata?.expected_amount_cents !== String(validation.amountCents)
      || session.metadata?.order_category !== orderCategory
      || session.metadata?.checkout_contract_version !== '1'
      || sessionCreatedAtUnix === null
      || session.expires_at - sessionCreatedAtUnix !== CHECKOUT_DURATION_SECONDS
      || session.metadata?.checkout_created_at_unix !== String(checkoutContract.createdAtUnix)
      || session.metadata?.checkout_expires_at_unix !== String(session.expires_at)
      || session.client_reference_id !== paymentReference
      || session.amount_total !== validation.amountCents
      || session.currency?.toLowerCase() !== 'aud'
      || session.mode !== 'payment';
    if (returnedContractInvalid) {
      console.error(`Checkout Session ${session.id} has invalid NDCC payment-reference metadata.`);
      if (session.status === 'open') {
        const expired = await stripe.checkout.sessions.expire(session.id).catch((expireError) => {
          console.error('Invalid-reference Checkout Session cleanup failed:', expireError);
          return null;
        });
        if (expired?.status === 'expired') {
          await supabase.from('order_payments')
            .update({ status: 'failed', recorded_by: 'stripe-checkout-reference-check' })
            .eq('id', reservationId)
            .eq('status', 'pending')
            .is('provider_reference', null);
        }
      }
      return NextResponse.json(
        { success: false, error: 'The payment attempt could not be safely verified. Please contact the club.' },
        { status: 503 }
      );
    }

    if (session.status === 'expired') {
      await supabase.from('order_payments')
        .update({ status: 'failed', recorded_by: 'stripe-checkout-status-check' })
        .eq('id', reservationId)
        .eq('status', 'pending')
        .is('provider_reference', null);
      return NextResponse.json(
        { success: false, error: 'The reserved Checkout session has expired. Please try again.' },
        { status: 409 },
      );
    }
    if (session.status !== 'open' && session.status !== 'complete') {
      return NextResponse.json(
        { success: false, error: 'Stripe returned an unsupported Checkout session state.' },
        { status: 503 },
      );
    }
    if (session.status === 'open' && !session.url) {
      const expired = await stripe.checkout.sessions.expire(session.id).catch((expireError) => {
        console.error('URL-less Checkout Session cleanup failed:', expireError);
        return null;
      });
      if (expired?.status === 'expired') {
        await supabase.from('order_payments')
          .update({ status: 'failed', recorded_by: 'stripe-checkout-status-check' })
          .eq('id', reservationId)
          .eq('status', 'pending')
          .is('provider_reference', null);
      }
      return NextResponse.json(
        { success: false, error: 'Stripe did not return a usable checkout URL.' },
        { status: 503 },
      );
    }

    const linkedPayment = await supabase.from('order_payments')
      .update({
        provider_reference: session.id,
        recorded_by: 'stripe-checkout',
        metadata: {
          ...paymentMetadata,
          checkout_origin: checkoutContract.origin,
          checkout_return_path: checkoutContract.returnPath,
          checkout_customer_email: checkoutContract.customerEmail,
          checkout_order_reference: checkoutContract.orderReference,
          idempotency_key: idempotencyKey,
          checkout_expires_at_unix: String(session.expires_at),
          checkout_expires_at: new Date(session.expires_at * 1000).toISOString(),
          checkout_session_status: 'open',
        },
      })
      .eq('id', reservationId)
      .eq('status', 'pending')
      .select('id,order_id,amount,payment_reference,provider_reference')
      .maybeSingle();

    let linked = linkedPayment.data;
    if (!linked && !linkedPayment.error) {
      const concurrent = await supabase.from('order_payments')
        .select('id,order_id,amount,payment_reference,provider_reference')
        .eq('id', reservationId)
        .maybeSingle();
      linked = concurrent.data;
    }
    if (linkedPayment.error || linked?.order_id !== order.id
      || Math.round(Number(linked?.amount) * 100) !== validation.amountCents
      || linked?.payment_reference !== paymentReference
      || linked?.provider_reference !== session.id) {
      console.error('Checkout-session reserved ledger link failed:', linkedPayment.error);
      if (session.status === 'open') {
        const expired = await stripe.checkout.sessions.expire(session.id).catch((expireError) => {
          console.error('Checkout-session cleanup failed:', expireError);
          return null;
        });
        if (expired?.status === 'expired') {
          await supabase.from('order_payments')
            .update({ status: 'failed', recorded_by: 'stripe-checkout-link-failure' })
            .eq('id', reservationId)
            .eq('status', 'pending')
            .is('provider_reference', null);
        }
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

    if (session.status === 'complete') {
      return NextResponse.json(
        { success: false, error: 'This payment is already being confirmed. Please refresh the order before trying again.' },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      checkout_url: session.url,
      amount: validation.amountCents / 100,
      payment_reference: paymentReference,
    });
  } catch (err) {
    console.error('Checkout-session route error:', err);
    return NextResponse.json({ success: false, error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
