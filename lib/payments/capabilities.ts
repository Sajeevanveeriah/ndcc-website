// Server-derived public payment capabilities.
//
// Replaces the old hardcoded client-side isStripeConfigured() false: the
// browser now learns which payment methods are available from this data,
// which never includes secrets. Card checkout requires BOTH the CMS switch
// (merch_payment_settings.card_checkout_enabled) and the environment arming
// (PAYMENT_PROVIDER=stripe_checkout + STRIPE_SECRET_KEY present).

import { isCheckoutEnabled } from '@/lib/payments/payment-config';

export type PaymentCapabilities = {
  bank_transfer: boolean;
  card: boolean;
  partial_payments: boolean;
  minimum_partial_amount: number;
};

export type MerchPaymentSettingsRow = {
  bank_transfer_enabled: boolean;
  card_checkout_enabled: boolean;
  partial_payments_enabled: boolean;
  minimum_partial_amount: number;
  required_deposit_percent: number | null;
};

export const DEFAULT_SETTINGS: MerchPaymentSettingsRow = {
  bank_transfer_enabled: true,
  card_checkout_enabled: false,
  partial_payments_enabled: false,
  minimum_partial_amount: 10,
  required_deposit_percent: null,
};

export async function loadMerchPaymentSettings(client: unknown): Promise<MerchPaymentSettingsRow> {
  const supabase = client as {
    from: (t: string) => {
      select: (c: string) => {
        maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }>;
      };
    };
  };
  try {
    const { data, error } = await supabase
      .from('merch_payment_settings')
      .select('bank_transfer_enabled,card_checkout_enabled,partial_payments_enabled,minimum_partial_amount,required_deposit_percent')
      .maybeSingle();
    if (error || !data) return DEFAULT_SETTINGS;
    const row = data as MerchPaymentSettingsRow;
    return {
      bank_transfer_enabled: Boolean(row.bank_transfer_enabled),
      card_checkout_enabled: Boolean(row.card_checkout_enabled),
      partial_payments_enabled: Boolean(row.partial_payments_enabled),
      minimum_partial_amount: Number(row.minimum_partial_amount) || DEFAULT_SETTINGS.minimum_partial_amount,
      required_deposit_percent: row.required_deposit_percent === null ? null : Number(row.required_deposit_percent),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function deriveCapabilities(settings: MerchPaymentSettingsRow): PaymentCapabilities {
  const cardArmed = settings.card_checkout_enabled && isCheckoutEnabled();
  return {
    bank_transfer: settings.bank_transfer_enabled,
    card: cardArmed,
    partial_payments: cardArmed && settings.partial_payments_enabled,
    minimum_partial_amount: settings.minimum_partial_amount,
  };
}
