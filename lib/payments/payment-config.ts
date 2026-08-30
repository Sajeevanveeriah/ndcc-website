import 'server-only';

/**
 * Central payment readiness config. The club has not chosen a payment
 * provider go-live yet: the live path is manual bank-transfer orders.
 * Stripe code stays dormant unless explicitly enabled via env:
 *   PAYMENT_PROVIDER    'manual' | 'stripe_checkout'
 *                       (defaults to 'manual' when unset or unrecognised)
 *   PAYMENT_TEST_MODE   'true' unless explicitly set to 'false'
 *   STRIPE_SECRET_KEY   must match PAYMENT_TEST_MODE
 *   STRIPE_WEBHOOK_SECRET is required before checkout is exposed
 * Nothing here may enable live charging by default. A live key paired with
 * test mode, or a test key paired with live mode, keeps checkout disabled.
 */

export type PaymentProvider = 'manual' | 'stripe_checkout';
export type StripeKeyMode = 'test' | 'live' | 'unknown' | 'missing';

const PAYMENT_PROVIDERS: readonly PaymentProvider[] = ['manual', 'stripe_checkout'];

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

export function isStripeWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

export function getStripeSecretKeyMode(key = process.env.STRIPE_SECRET_KEY): StripeKeyMode {
  const value = (key || '').trim();
  if (!value) return 'missing';
  if (/^[sr]k_test_/.test(value)) return 'test';
  if (/^[sr]k_live_/.test(value)) return 'live';
  return 'unknown';
}

export function isStripeKeyModeCompatible(): boolean {
  const requiredMode: StripeKeyMode = isPaymentTestMode() ? 'test' : 'live';
  return getStripeSecretKeyMode() === requiredMode;
}

/**
 * Online checkout is armed only when the club has explicitly selected the
 * stripe_checkout provider, a mode-compatible Stripe key and a webhook
 * signing secret are all present. A key on its own (for example, one left in
 * an environment file) must never enable charging.
 */
export function isCheckoutEnabled(): boolean {
  return getPaymentProvider() === 'stripe_checkout'
    && isStripeSecretConfigured()
    && isStripeWebhookConfigured()
    && isStripeKeyModeCompatible();
}
