import 'server-only';

/**
 * Central payment readiness config. The club has not chosen a payment
 * provider go-live yet: the live path is manual bank-transfer orders.
 * Stripe code stays dormant unless explicitly enabled via env:
 *   PAYMENT_PROVIDER    'manual' | 'stripe_payment_link' | 'stripe_checkout'
 *                       (defaults to 'manual' when unset or unrecognised)
 *   PAYMENT_TEST_MODE   'true' unless explicitly set to 'false'
 * Nothing here may enable live charging by default.
 */

export type PaymentProvider = 'manual' | 'stripe_payment_link' | 'stripe_checkout';

const PAYMENT_PROVIDERS: readonly PaymentProvider[] = ['manual', 'stripe_payment_link', 'stripe_checkout'];

export function getPaymentProvider(): PaymentProvider {
  const raw = (process.env.PAYMENT_PROVIDER || '').trim().toLowerCase();
  return (PAYMENT_PROVIDERS as readonly string[]).includes(raw) ? (raw as PaymentProvider) : 'manual';
}

export function isPaymentTestMode(): boolean {
  // Test mode stays on unless the club explicitly opts out.
  return process.env.PAYMENT_TEST_MODE !== 'false';
}

export function isStripeSecretConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Online checkout is armed only when the club has explicitly selected the
 * stripe_checkout provider AND a Stripe secret key is present. A key on its
 * own (e.g. left over in an env file) must never enable charging.
 */
export function isCheckoutEnabled(): boolean {
  return getPaymentProvider() === 'stripe_checkout' && isStripeSecretConfigured();
}
