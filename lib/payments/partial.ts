// Pure validation for customer-initiated card payments (full or partial).
//
// Used by /api/payments/checkout-session before a Stripe session is created.
// All amounts are validated in integer cents; the caller supplies the
// order's live balance and the CMS payment settings.

import { toCents } from '@/lib/apparel/pricing';

export type PaymentRequestInput = {
  // Requested amount in dollars; null/undefined means "pay the full balance".
  requestedAmount?: number | null;
  balanceDue: number;
  minimumPartialAmount: number;
  partialPaymentsEnabled: boolean;
  orderStatus: string | null | undefined;
  paymentStatus: string | null | undefined;
};

export type PaymentRequestValidation =
  | { ok: true; amountCents: number; isPartial: boolean }
  | { ok: false; error: string };

export function validatePaymentRequest(input: PaymentRequestInput): PaymentRequestValidation {
  const balanceCents = toCents(Number(input.balanceDue));
  if (!Number.isFinite(balanceCents)) {
    return { ok: false, error: 'Order balance is invalid.' };
  }
  if ((input.orderStatus || '').toLowerCase() === 'cancelled') {
    return { ok: false, error: 'This order has been cancelled and can no longer be paid.' };
  }
  if ((input.paymentStatus || '') === 'needs_review') {
    return { ok: false, error: 'This order needs committee review before further payments can be taken.' };
  }
  if (balanceCents <= 0) {
    return { ok: false, error: 'This order is already fully paid.' };
  }

  if (input.requestedAmount === null || input.requestedAmount === undefined) {
    return { ok: true, amountCents: balanceCents, isPartial: false };
  }

  const amountCents = toCents(Number(input.requestedAmount));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, error: 'Payment amount must be greater than zero.' };
  }
  if (amountCents > balanceCents) {
    return { ok: false, error: 'Payment amount cannot exceed the balance due.' };
  }
  if (amountCents === balanceCents) {
    return { ok: true, amountCents, isPartial: false };
  }

  // A true part payment: only when the club has enabled it, and at least the
  // configured minimum (a final payment smaller than the minimum is always
  // allowed via the amountCents === balanceCents branch above).
  if (!input.partialPaymentsEnabled) {
    return { ok: false, error: 'Part payments are not currently enabled. Please pay the full balance.' };
  }
  const minCents = toCents(Number(input.minimumPartialAmount));
  if (Number.isFinite(minCents) && minCents > 0 && amountCents < minCents) {
    return { ok: false, error: `Part payments must be at least $${(minCents / 100).toFixed(2)}.` };
  }
  return { ok: true, amountCents, isPartial: true };
}
