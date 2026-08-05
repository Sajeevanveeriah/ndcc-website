export type CheckoutEventAction = 'ignore' | 'pending' | 'settle' | 'fail';

type IdempotencyKeyInput = {
  orderId: string;
  amountPaidCents: number;
  amountCents: number;
};

export function buildCheckoutIdempotencyKey({
  orderId,
  amountPaidCents,
  amountCents,
}: IdempotencyKeyInput): string {
  return `ndcc:checkout:${orderId}:${amountPaidCents}:${amountCents}`;
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
