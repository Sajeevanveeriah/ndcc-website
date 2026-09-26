import Badge from '@/components/ui/Badge';
import type { Order } from '@/lib/types';

export type AdminOrder = Order & {
  bank_transfer_selected_at?: string | null;
  deleted_at?: string | null;
  order_category?: string;
  meal_collection_window?: string | null;
  meal_service_date?: string | null;
  amount_paid?: number | null;
  balance_due?: number | null;
  payment_reference?: string | null;
  order_status?: string | null;
  needs_review_reason?: string | null;
  merch_window_label?: string | null;
};

export type OrderPayment = {
  id: string;
  order_id: string;
  payment_reference?: string | null;
  client_operation_id?: string | null;
  amount: number;
  currency: string;
  method: string;
  provider: string | null;
  provider_reference: string | null;
  status: string;
  received_at: string | null;
  recorded_by: string | null;
  notes: string | null;
  reverses_payment_id: string | null;
  created_at: string;
};

export type PaymentSettings = {
  id?: boolean;
  bank_transfer_enabled: boolean;
  card_checkout_enabled: boolean;
  partial_payments_enabled: boolean;
  minimum_partial_amount: number;
  required_deposit_percent: number | null;
  // NULL inherits bank_transfer_enabled. Absent until the migration is applied.
  raffle_bank_transfer_enabled?: boolean | null;
  reverse_raffle_bank_transfer_enabled?: boolean | null;
  dino_bank_transfer_enabled?: boolean | null;
  donation_bank_transfer_enabled?: boolean | null;
};

export const BANK_TRANSFER_PRODUCT_SETTINGS = [
  { key: 'raffle_bank_transfer_enabled', label: 'Trailer raffle' },
  { key: 'reverse_raffle_bank_transfer_enabled', label: 'Reverse raffle' },
  { key: 'dino_bank_transfer_enabled', label: 'Dino Coach' },
  { key: 'donation_bank_transfer_enabled', label: 'Donations' },
] as const;

export type PaymentFormState = { method: string; amount: string; notes: string };

export const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

export function paymentBadge(status: string) {
  switch (status) {
    case 'paid': return <Badge variant="success">Paid</Badge>;
    case 'part_paid': return <Badge variant="info">Part paid</Badge>;
    case 'partially_refunded': return <Badge variant="info">Partially refunded</Badge>;
    case 'refunded': return <Badge variant="default">Refunded</Badge>;
    case 'needs_review': return <Badge variant="danger">Needs review</Badge>;
    case 'pending_bank_transfer':
    case 'pending':
    case 'unpaid':
    default:
      return <Badge variant="warning">Unpaid</Badge>;
  }
}

// Legacy orders (pre-ledger) may carry payment_status 'paid' without ledger
// rows; treat those as settled for the balance gate.
export function balanceDue(order: AdminOrder): number {
  if (typeof order.balance_due === 'number') {
    return order.payment_status === 'paid' ? Math.max(0, order.balance_due) : order.balance_due;
  }
  return order.payment_status === 'paid' ? 0 : Number(order.total_amount || 0);
}
