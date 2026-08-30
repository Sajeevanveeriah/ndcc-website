export const MANUAL_PAYMENT_LIMITS = Object.freeze({
  notesLength: 500,
  providerReferenceLength: 120,
  maximumCents: 2_147_483_647,
});

export function parsePositiveAudCents(value: unknown): number | null {
  if (typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value <= 0
    || value > MANUAL_PAYMENT_LIMITS.maximumCents) return null;
  return value;
}

export function parseAudInputToCents(value: string): number | null {
  const text = value.trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(text)) return null;
  const [dollars, fraction = ''] = text.split('.');
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  return parsePositiveAudCents(cents);
}

export function isPaymentOperationUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
