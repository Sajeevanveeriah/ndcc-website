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
