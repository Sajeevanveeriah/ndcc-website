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
