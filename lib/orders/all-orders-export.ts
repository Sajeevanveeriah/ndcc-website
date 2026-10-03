// Every order, every category (kitchen, merchandise, memberships, events,
// donations, spins and others): one row per order with how the purchaser said
// they would pay and how money actually arrived. Unpaid orders are included,
// unlike the payment ledger export, so "pay at the club" and bank transfer
// orders still awaiting payment can be followed up from one sheet.
//
// Pure row building (no I/O) so the shape is unit-testable.

export type AllOrdersExportOrder = {
  id: string;
  created_at: string;
  payment_reference?: string | null;
  order_category?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  items?: Array<{ name?: string; size?: string; quantity?: number; event_id?: string | null }> | null;
  total_amount?: number | string | null;
  amount_paid?: number | string | null;
  balance_due?: number | string | null;
  payment_status?: string | null;
  order_status?: string | null;
  processed?: boolean | null;
  notes?: string | null;
  meal_service_date?: string | null;
  bank_transfer_selected_at?: string | null;
  bar_payment_selected_at?: string | null;
  payment_method_choice?: string | null;
  payment_method_choice_source?: string | null;
  payment_method_choice_by?: string | null;
  payment_method_choice_at?: string | null;
};

export type AllOrdersExportPayment = { order_id: string; method: string; status: string; amount?: number | string | null };

export const ALL_ORDERS_EXPORT_HEADER = [
  'order_reference',
  'order_category',
  'order_date_iso',
  'order_date_melbourne',
  'meal_service_date',
  'customer_name',
  'customer_email',
  'customer_phone',
  'items',
  'order_total_aud',
  'amount_paid_aud',
  'balance_due_aud',
  'payment_status',
  'stated_payment_method',
  'stated_method_set_by',
  'stated_method_set_at',
  'paid_by',
  'paid_cash_or_card_at_club_aud',
  'paid_bank_transfer_aud',
  'paid_stripe_aud',
  'paid_other_aud',
  'bank_transfer_selected_at',
  'pay_at_club_selected_at',
  'order_status',
  'order_processed',
  'notes',
] as const;

const STATED_LABELS: Record<string, string> = {
  stripe: 'Stripe checkout (card online)',
  bank_transfer: 'Bank transfer',
  pay_at_club: 'Pay at the club',
};
const PAID_LABELS: Record<string, string> = {
  stripe: 'Card online (Stripe)',
  bank_transfer: 'Bank transfer',
  cash: 'Cash or card at the club',
  other: 'Other',
};
const SOURCE_LABELS: Record<string, string> = { purchaser: 'Purchaser', admin: 'Committee', backfill: 'Earlier records' };

const melbourneDate = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});

function money(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? (Math.round(numeric * 100) / 100).toFixed(2) : '';
}

/** The recorded choice, else the intent columns. */
export function statedMethod(order: AllOrdersExportOrder): string {
  if (order.payment_method_choice && STATED_LABELS[order.payment_method_choice]) return order.payment_method_choice;
  if (order.bar_payment_selected_at) return 'pay_at_club';
  if (order.bank_transfer_selected_at) return 'bank_transfer';
  return '';
}

export function buildAllOrdersExportRows(orders: AllOrdersExportOrder[], payments: AllOrdersExportPayment[]): string[][] {
  const settled = new Map<string, AllOrdersExportPayment[]>();
  for (const payment of payments) {
    if (payment.status !== 'settled') continue;
    settled.set(payment.order_id, [...(settled.get(payment.order_id) || []), payment]);
  }
  const rows: string[][] = [[...ALL_ORDERS_EXPORT_HEADER]];
  for (const order of orders) {
    const paid = settled.get(order.id) || [];
    const sum = (method: string) => {
      const total = paid.filter((payment) => payment.method === method).reduce((acc, payment) => acc + Number(payment.amount || 0), 0);
      return total ? money(total) : '';
    };
    const stated = statedMethod(order);
    const amountPaid = order.amount_paid ?? (order.payment_status === 'paid' ? order.total_amount : 0);
    const balance = order.balance_due ?? Number(order.total_amount || 0) - Number(amountPaid || 0);
    const created = new Date(order.created_at);
    rows.push([
      order.payment_reference || order.id,
      order.order_category || 'other',
      Number.isNaN(created.getTime()) ? '' : created.toISOString(),
      Number.isNaN(created.getTime()) ? '' : melbourneDate.format(created),
      order.meal_service_date || '',
      order.customer_name || '',
      order.customer_email || '',
      order.customer_phone || '',
      (order.items || []).map((item) => `${item.name || 'Item'}${item.size && item.size !== 'kitchen' ? ` (${item.size})` : ''} x${item.quantity ?? 1}`).join('; '),
      money(order.total_amount),
      money(amountPaid),
      money(balance),
      order.payment_status || '',
      stated ? STATED_LABELS[stated] : 'Not recorded',
      order.payment_method_choice_source
        ? `${SOURCE_LABELS[order.payment_method_choice_source] || order.payment_method_choice_source}${order.payment_method_choice_by ? ` (${order.payment_method_choice_by})` : ''}`
        : '',
      order.payment_method_choice_at || '',
      Array.from(new Set(paid.map((payment) => PAID_LABELS[payment.method] || payment.method))).join('; '),
      sum('cash'),
      sum('bank_transfer'),
      sum('stripe'),
      sum('other'),
      order.bank_transfer_selected_at || '',
      order.bar_payment_selected_at || '',
      order.order_status || '',
      order.processed ? 'yes' : 'no',
      order.notes || '',
    ]);
  }
  return rows;
}
