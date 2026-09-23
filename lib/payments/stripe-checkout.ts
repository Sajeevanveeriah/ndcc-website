import type Stripe from 'stripe';

export type CheckoutEventAction = 'ignore' | 'pending' | 'settle' | 'fail';

type IdempotencyKeyInput = {
  paymentReference: string;
};

export function buildCheckoutIdempotencyKey({
  paymentReference,
}: IdempotencyKeyInput): string {
  if (!/^(?:NDCC[A-Z]{3}|NCDDKIT)-[0-9]{4}-[0-9]{6}$/.test(paymentReference)) {
    throw new Error('A canonical NDCC payment reference is required for Checkout idempotency.');
  }
  return `ndcc:checkout:v3:${paymentReference}`;
}

export function getCheckoutEventAction(
  eventType: string,
  paymentStatus: string | null | undefined
): CheckoutEventAction {
  if (eventType === 'checkout.session.completed') {
    return paymentStatus === 'paid' ? 'settle' : 'pending';
  }
  if (eventType === 'checkout.session.async_payment_succeeded') return 'settle';
  if (eventType === 'checkout.session.async_payment_failed' || eventType === 'checkout.session.expired') {
    return 'fail';
  }
  return 'ignore';
}

/**
 * Explicit inputs for a one-off `mode: 'payment'` Checkout Session. Each
 * caller passes its own values (idempotency key scheme, expiry, metadata,
 * URLs); nothing is defaulted or unified here.
 *
 * Fields are copied after `mode` in the caller's insertion order, and fields
 * whose value is `undefined` are omitted rather than sent. This keeps the
 * create() arguments exactly what each route sent before this helper existed,
 * which matters for routes that hash the params into their idempotency key
 * (Dino Coach) and for Stripe's same-key/same-parameters check on retries.
 */
export type PaymentCheckoutSessionFields = {
  client_reference_id: string;
  customer_email?: string;
  expires_at?: number;
  line_items: Stripe.Checkout.SessionCreateParams.LineItem[];
  success_url: string;
  cancel_url: string;
  metadata: Stripe.MetadataParam;
  payment_intent_data: Stripe.Checkout.SessionCreateParams.PaymentIntentData;
};

export function buildPaymentCheckoutSessionParams(
  fields: PaymentCheckoutSessionFields,
): Stripe.Checkout.SessionCreateParams {
  const params: Record<string, unknown> = { mode: 'payment' };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) params[key] = value;
  }
  return params as Stripe.Checkout.SessionCreateParams;
}

type CheckoutSessionsClient = {
  checkout: { sessions: Pick<Stripe.Checkout.SessionResource, 'create'> };
};

/** Creates the Session with the caller's own idempotency key (never derived here). */
export function createPaymentCheckoutSession(
  stripe: CheckoutSessionsClient,
  params: Stripe.Checkout.SessionCreateParams,
  idempotencyKey: string,
): Promise<Stripe.Response<Stripe.Checkout.Session>> {
  return stripe.checkout.sessions.create(params, { idempotencyKey });
}
