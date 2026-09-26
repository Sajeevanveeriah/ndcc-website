import type { OrderItem } from '@/lib/types';
import type { CatalogueOption } from '@/lib/apparel/pricing';
import type { Dispatch, SetStateAction } from 'react';

export interface CartItem extends OrderItem {
  id: string;
  options?: Record<string, string>;
  option_labels?: string[];
}

export type MerchandiseWindow = {
  id: string;
  label: string;
  open_date: string;
  close_date: string;
  allow_queue_after_close: boolean;
};

export type DisplayProduct = {
  id: string;
  name: string;
  price: number;
  description: string;
  sizes: string[];
  image: string;
  imageAlt: string;
  customisable?: boolean;
  category?: string;
  payment_mode?: string | null;
  options: CatalogueOption[];
};

export type ApiProduct = {
  slug: string;
  name: string;
  description: string;
  price: number;
  sizes: string[];
  image_url: string;
  customisable: boolean;
  category?: string;
  display_order?: number;
  order_guidance?: string | null;
  size_guidance?: string | null;
  // Payment-readiness fields (may be absent until the migration is applied).
  payment_mode?: string | null;
  stripe_price_id?: string | null;
  checkout_enabled?: boolean | null;
  fulfilment_notes?: string | null;
  order_email?: string | null;
  image_alt?: string | null;
  options?: CatalogueOption[] | null;
};

export type PaymentCapabilities = {
  bank_transfer: boolean;
  card: boolean;
  partial_payments: boolean;
  minimum_partial_amount: number;
};

export type OrderConfirmation = {
  customer_email: string;
  order_id: string;
  total_amount: number;
  payment_reference: string;
  personalisation_requested: boolean;
  number_requested: boolean;
  bank_details: { account_name: string; bsb: string; account_number: string };
};

type Setter<T> = Dispatch<SetStateAction<T>>;

/** Per-product selection state owned by MerchandiseClient and edited by the
 *  catalogue cards (options, size, quantity and personalisation). */
export type ProductSelectionState = {
  selectedOptions: Record<string, Record<string, string>>;
  setSelectedOptions: Setter<Record<string, Record<string, string>>>;
  selectedSizes: Record<string, string>;
  setSelectedSizes: Setter<Record<string, string>>;
  sizeErrors: Record<string, string>;
  setSizeErrors: Setter<Record<string, string>>;
  quantities: Record<string, number>;
  setQuantities: Setter<Record<string, number>>;
  customNames: Record<string, string>;
  setCustomNames: Setter<Record<string, string>>;
  customNumbers: Record<string, string>;
  setCustomNumbers: Setter<Record<string, string>>;
  alternateNumbers: Record<string, string>;
  setAlternateNumbers: Setter<Record<string, string>>;
  personalisationConfirmed: Record<string, boolean>;
  setPersonalisationConfirmed: Setter<Record<string, boolean>>;
  personalisationErrors: Record<string, string>;
  setPersonalisationErrors: Setter<Record<string, string>>;
};
