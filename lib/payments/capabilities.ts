// Server-derived public payment capabilities.
//
// Replaces the old hardcoded client-side isStripeConfigured() false: the
// browser now learns which payment methods are available from this data,
// which never includes secrets. Card checkout requires BOTH the CMS switch
// (merch_payment_settings.card_checkout_enabled) and the environment arming
// (PAYMENT_PROVIDER=stripe_checkout + STRIPE_SECRET_KEY present).
//
// Bank deposit can be switched per product. A NULL (or missing) per-product
// column inherits bank_transfer_enabled, so behaviour is unchanged until an
// administrator sets an override.

import { configuredBankDetails } from '@/lib/payments/bank-transfer';
import { isCheckoutEnabled } from '@/lib/payments/payment-config';

export type PaymentCapabilities = {
  bank_transfer: boolean;
  card: boolean;
  partial_payments: boolean;
  minimum_partial_amount: number;
};

export const BANK_TRANSFER_PRODUCTS = ['raffle', 'reverse_raffle', 'dino', 'donation'] as const;
export type BankTransferProduct = typeof BANK_TRANSFER_PRODUCTS[number];
type ProductOverrideColumn = `${BankTransferProduct}_bank_transfer_enabled`;

export type MerchPaymentSettingsRow = {
  bank_transfer_enabled: boolean;
  card_checkout_enabled: boolean;
  partial_payments_enabled: boolean;
  minimum_partial_amount: number;
  required_deposit_percent: number | null;
} & Partial<Record<ProductOverrideColumn, boolean | null>>;

export const DEFAULT_SETTINGS: MerchPaymentSettingsRow = {
  bank_transfer_enabled: true,
  card_checkout_enabled: false,
  partial_payments_enabled: false,
  minimum_partial_amount: 10,
  required_deposit_percent: null,
};

const BASE_COLUMNS = 'bank_transfer_enabled,card_checkout_enabled,partial_payments_enabled,minimum_partial_amount,required_deposit_percent';
const overrideColumn = (product: BankTransferProduct): ProductOverrideColumn => `${product}_bank_transfer_enabled`;
const PRODUCT_COLUMNS = BANK_TRANSFER_PRODUCTS.map(overrideColumn).join(',');

/** Narrows an untrusted value (for example a query parameter) to a product. */
export function bankTransferProduct(value: unknown): BankTransferProduct | undefined {
  return (BANK_TRANSFER_PRODUCTS as readonly unknown[]).includes(value) ? value as BankTransferProduct : undefined;
}

export async function loadMerchPaymentSettings(client: unknown): Promise<MerchPaymentSettingsRow> {
  const supabase = client as {
    from: (t: string) => {
      select: (c: string) => {
        maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }>;
      };
    };
  };
  const read = (columns: string) => supabase.from('merch_payment_settings').select(columns).maybeSingle();
  try {
    let { data, error } = await read(`${BASE_COLUMNS},${PRODUCT_COLUMNS}`);
    // Per-product columns may not be migrated yet: fall back to the original
    // row only for that missing-column case. Any other error fails closed so a
    // disabled product override can never be lost to a transient failure.
    if (error && /_bank_transfer_enabled|schema cache|column/i.test(error.message || '')) ({ data, error } = await read(BASE_COLUMNS));
    if (error || !data) return { ...DEFAULT_SETTINGS, bank_transfer_enabled: false };
    const row = data as MerchPaymentSettingsRow;
    const settings: MerchPaymentSettingsRow = {
      bank_transfer_enabled: Boolean(row.bank_transfer_enabled),
      card_checkout_enabled: Boolean(row.card_checkout_enabled),
      partial_payments_enabled: Boolean(row.partial_payments_enabled),
      minimum_partial_amount: Number(row.minimum_partial_amount) || DEFAULT_SETTINGS.minimum_partial_amount,
      required_deposit_percent: row.required_deposit_percent === null ? null : Number(row.required_deposit_percent),
    };
    for (const product of BANK_TRANSFER_PRODUCTS) {
      const column = overrideColumn(product);
      if (column in row) settings[column] = typeof row[column] === 'boolean' ? row[column] : null;
    }
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS, bank_transfer_enabled: false };
  }
}

/** Whether bank deposit is switched on for a product (NULL inherits the general switch). */
export function bankTransferEnabledFor(settings: MerchPaymentSettingsRow, product?: BankTransferProduct): boolean {
  const override = product ? settings[overrideColumn(product)] : null;
  return typeof override === 'boolean' ? override : settings.bank_transfer_enabled;
}

export function deriveCapabilities(settings: MerchPaymentSettingsRow, product?: BankTransferProduct): PaymentCapabilities {
  const cardArmed = settings.card_checkout_enabled && isCheckoutEnabled();
  return {
    bank_transfer: bankTransferEnabledFor(settings, product) && Boolean(configuredBankDetails()),
    card: cardArmed,
    partial_payments: cardArmed && settings.partial_payments_enabled,
    minimum_partial_amount: settings.minimum_partial_amount,
  };
}
