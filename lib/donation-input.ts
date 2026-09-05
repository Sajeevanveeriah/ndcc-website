import { audAmountToCents, PUBLIC_ORDER_LIMITS } from './order-input-validation';

export function validateDonationInput(body: Record<string, unknown>) {
  const amount = audAmountToCents(body.amount, { allowZero: false });
  if (!amount.ok || amount.value < 1000) return { ok: false as const, error: 'Enter an amount from AUD 10 to AUD 10,000, with no more than two decimal places.' };
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > PUBLIC_ORDER_LIMITS.nameLength
    || typeof body.email !== 'string' || body.email.length > PUBLIC_ORDER_LIMITS.emailLength
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    return { ok: false as const, error: 'Enter your name and a valid email address.' };
  }
  if (typeof body.hp_field !== 'string' || body.hp_field.length > 200
    || typeof body.submitted_at !== 'number' || !Number.isFinite(body.submitted_at) || body.submitted_at <= 0) {
    return { ok: false as const, error: 'Please refresh the page and try again.' };
  }
  return { ok: true as const, amount: amount.value / 100, name: body.name.trim(), email: body.email.trim() };
}
