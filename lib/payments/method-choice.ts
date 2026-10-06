// Stated payment method on an order (orders.payment_method_choice). Intent
// only: settled money lives in the order_payments ledger. No runtime imports,
// so admin pages, exports and tests can all use it.

export const PAYMENT_METHOD_CHOICES = ['stripe', 'bank_transfer', 'pay_at_club'] as const;
export type PaymentMethodChoice = typeof PAYMENT_METHOD_CHOICES[number];

export const PAYMENT_METHOD_CHOICE_LABELS: Record<PaymentMethodChoice, string> = {
  stripe: 'Stripe checkout (card online)',
  bank_transfer: 'Bank transfer',
  pay_at_club: 'Pay at the club',
};

export const PAYMENT_METHOD_CHOICE_SOURCE_LABELS: Record<string, string> = {
  purchaser: 'chosen by purchaser',
  admin: 'set by committee',
  backfill: 'from earlier records',
};

type ChoiceFields = {
  payment_method_choice?: string | null;
  bank_transfer_selected_at?: string | null;
  bar_payment_selected_at?: string | null;
};

export function isPaymentMethodChoice(value: unknown): value is PaymentMethodChoice {
  return (PAYMENT_METHOD_CHOICES as readonly unknown[]).includes(value);
}

/**
 * The stated method for display and export. Falls back to the intent columns
 * so the answer is right even before the database migration is applied.
 */
export function effectivePaymentChoice(order: ChoiceFields): PaymentMethodChoice | null {
  if (isPaymentMethodChoice(order.payment_method_choice)) return order.payment_method_choice;
  if (order.bar_payment_selected_at) return 'pay_at_club';
  if (order.bank_transfer_selected_at) return 'bank_transfer';
  return null;
}

/**
 * Whether an unpaid order belongs in the bank deposit reconciliation queue:
 * the purchaser (or committee) chose bank deposit, or no method was stated at
 * all. Event and kitchen confirmations email the bank details without
 * recording a choice, so a deposit can arrive for an order that never
 * "selected" bank transfer.
 */
export function awaitsBankDeposit(order: ChoiceFields): boolean {
  return Boolean(order.bank_transfer_selected_at) || effectivePaymentChoice(order) === null;
}

/** PostgREST `or` filter matching awaitsBankDeposit (payment_method_choice is constrained to the known methods). */
export const BANK_DEPOSIT_QUEUE_FILTER = 'bank_transfer_selected_at.not.is.null,and(payment_method_choice.is.null,bar_payment_selected_at.is.null)';

export const METHOD_NOT_STATED_LABEL = 'No payment method stated - bank details were sent; receipt not confirmed';

export function paymentChoiceLabel(order: ChoiceFields): string {
  const choice = effectivePaymentChoice(order);
  return choice ? PAYMENT_METHOD_CHOICE_LABELS[choice] : 'Not recorded';
}

/**
 * The orders update an administrator's choice makes. The intent columns are
 * kept consistent with the choice (existing pages and reminders read them),
 * keeping an earlier selection time where there is one.
 */
export function paymentChoicePatch(order: ChoiceFields, method: PaymentMethodChoice | null, actor: string, now: string) {
  return {
    payment_method_choice: method,
    payment_method_choice_source: method ? 'admin' : null,
    payment_method_choice_by: method ? actor.slice(0, 320) : null,
    payment_method_choice_at: method ? now : null,
    bar_payment_selected_at: method === 'pay_at_club' ? order.bar_payment_selected_at || now : null,
    bank_transfer_selected_at: method === 'bank_transfer' ? order.bank_transfer_selected_at || now : null,
  };
}

/**
 * The offline method that rules out paying this order online, or null when
 * card checkout may be offered. A purchaser who chose bank transfer or paying
 * at the club (bar) is not shown "pay online"; unticking that choice (or the
 * committee changing it) clears the intent column and card comes back.
 */
export function offlineChoiceBlockingCard(order: ChoiceFields): Exclude<PaymentMethodChoice, 'stripe'> | null {
  // The intent columns, not payment_method_choice: purchaser unticking clears
  // only the intent column, and paymentChoicePatch keeps both in step for admins.
  if (order.bar_payment_selected_at) return 'pay_at_club';
  if (order.bank_transfer_selected_at) return 'bank_transfer';
  return null;
}

export const CARD_BLOCKED_BY_CHOICE_MESSAGE: Record<Exclude<PaymentMethodChoice, 'stripe'>, string> = {
  pay_at_club: 'You chose to pay at the club. Untick that choice first if you would rather pay online.',
  bank_transfer: 'You chose to pay by bank transfer. Untick that choice first if you would rather pay online.',
};
