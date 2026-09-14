import { createServerClient } from '@/lib/supabase-server';

export const PAYMENT_REFERENCE_PREFIXES = {
  merch: 'NDCCMER',
  kitchen: 'NDCCKIT',
  membership: 'NDCCMEM',
  event: 'NDCCEVT',
  raffle: 'NDCCRAF',
  dino_coach: 'NDCCDCO',
  general: 'NDCCPAY',
} as const;

export type PaymentReferenceCategory = keyof typeof PAYMENT_REFERENCE_PREFIXES;

const PAYMENT_REFERENCE_PATTERN = /^(?:NDCC(?:MER|KIT|MEM|EVT|RAF|DCO|PAY)|NCDDKIT)-[0-9]{4}-[0-9]{6}$/;

export function normalisePaymentReferenceCategory(value: unknown): PaymentReferenceCategory {
  const category = String(value || '').trim().toLowerCase();
  if (category === 'merchandise') return 'merch';
  if (category === 'dino-coach') return 'dino_coach';
  if (Object.prototype.hasOwnProperty.call(PAYMENT_REFERENCE_PREFIXES, category)) {
    return category as PaymentReferenceCategory;
  }
  return 'general';
}

export function isCanonicalPaymentReference(
  value: unknown,
  category?: PaymentReferenceCategory,
): value is string {
  if (typeof value !== 'string' || !PAYMENT_REFERENCE_PATTERN.test(value)) return false;
  return !category || value.startsWith(`${PAYMENT_REFERENCE_PREFIXES[category]}-`)
    || (category === 'kitchen' && value.startsWith('NCDDKIT-'));
}

export async function generateUniquePaymentReference(category: PaymentReferenceCategory) {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc('allocate_payment_reference', {
    target_category: category,
  });
  if (error) {
    throw new Error(`Could not allocate an NDCC payment reference: ${error.message}`);
  }
  if (!isCanonicalPaymentReference(data, category)) {
    throw new Error('The NDCC payment-reference allocator returned an invalid value.');
  }
  return data;
}
