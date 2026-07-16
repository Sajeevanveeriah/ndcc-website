// Merchandise order CSV export — pure row building (no I/O) so the shape is
// unit-testable with synthetic data.
//
// One row per order item. Money is AUD with two decimals; timestamps are
// exported twice: ISO 8601 (order_date_iso) and an Australia/Melbourne
// display date (order_date_melbourne).

export type ExportOrder = {
  id: string;
  created_at: string;
  payment_reference?: string | null;
  merch_window_label?: string | null;
  merch_window_id?: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  items: Array<{
    slug?: string;
    name?: string;
    size?: string;
    quantity?: number;
    price?: number;
    base_price?: number;
    applied_options?: Array<{ group: string; value: string; label: string; price_delta: number }>;
    custom_name?: string;
    custom_number?: number;
  }>;
  total_amount: number;
  amount_paid?: number | null;
  balance_due?: number | null;
  payment_status: string;
  processed?: boolean | null;
  order_status?: string | null;
  notes?: string | null;
};

export type ExportPayment = {
  order_id: string;
  method: string;
  status: string;
  provider_reference?: string | null;
};

export type ExportFilters = {
  windowId?: string | null;
  dateFrom?: string | null; // inclusive ISO date/timestamp
  dateTo?: string | null;   // inclusive ISO date/timestamp
  paymentStatus?: string | null;
  processed?: 'true' | 'false' | null;
  product?: string | null;  // slug or name substring, case-insensitive
  paidInFullOnly?: boolean;
  includePartPaid?: boolean; // default true
};

export const EXPORT_HEADER = [
  'order_reference',
  'order_date_iso',
  'order_date_melbourne',
  'order_window',
  'customer_name',
  'customer_email',
  'customer_phone',
  'product',
  'selected_options',
  'size',
  'quantity',
  'custom_name',
  'custom_number',
  'unit_base_price',
  'option_surcharges',
  'final_unit_price',
  'line_total',
  'order_total',
  'amount_paid',
  'balance_due',
  'payment_status',
  'payment_methods',
  'payment_references',
  'order_processed',
  'notes',
];

const melbourneDate = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Melbourne',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function aud(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

const UNPAID_ALIASES = new Set(['unpaid', 'pending', 'pending_bank_transfer']);

export function orderMatchesFilters(order: ExportOrder, filters: ExportFilters): boolean {
  if (filters.windowId && order.merch_window_id !== filters.windowId) return false;
  if (filters.dateFrom && new Date(order.created_at) < new Date(filters.dateFrom)) return false;
  if (filters.dateTo && new Date(order.created_at) > new Date(filters.dateTo)) return false;
  if (filters.paymentStatus) {
    const wanted = filters.paymentStatus;
    const actual = order.payment_status || '';
    const matches = wanted === 'unpaid' ? UNPAID_ALIASES.has(actual) : actual === wanted;
    if (!matches) return false;
  }
  if (filters.processed === 'true' && !order.processed) return false;
  if (filters.processed === 'false' && order.processed) return false;
  if (filters.paidInFullOnly && order.payment_status !== 'paid') return false;
  if (filters.includePartPaid === false
    && (order.payment_status === 'part_paid' || order.payment_status === 'partially_refunded')) return false;
  return true;
}

export function buildMerchExportRows(
  orders: ExportOrder[],
  payments: ExportPayment[],
  filters: ExportFilters = {}
): Array<Array<string | number>> {
  const paymentsByOrder = new Map<string, ExportPayment[]>();
  for (const payment of payments) {
    const list = paymentsByOrder.get(payment.order_id) || [];
    list.push(payment);
    paymentsByOrder.set(payment.order_id, list);
  }

  const rows: Array<Array<string | number>> = [EXPORT_HEADER];
  const productNeedle = (filters.product || '').trim().toLowerCase();

  for (const order of orders) {
    if (!orderMatchesFilters(order, filters)) continue;

    const orderPayments = (paymentsByOrder.get(order.id) || []).filter((p) => p.status === 'settled' || p.status === 'refunded');
    const methods = Array.from(new Set(orderPayments.map((p) => p.method))).join('; ');
    const references = [
      order.payment_reference || '',
      ...orderPayments.map((p) => p.provider_reference || '').filter(Boolean),
    ].filter(Boolean).join('; ');

    const amountPaid = typeof order.amount_paid === 'number'
      ? order.amount_paid
      : order.payment_status === 'paid' ? order.total_amount : 0;
    const balance = typeof order.balance_due === 'number'
      ? order.balance_due
      : order.total_amount - amountPaid;

    for (const item of order.items || []) {
      const name = item.name || item.slug || '';
      if (productNeedle
        && !String(item.slug || '').toLowerCase().includes(productNeedle)
        && !name.toLowerCase().includes(productNeedle)) continue;

      const quantity = Number(item.quantity || 0);
      const finalUnit = Number(item.price || 0);
      const surcharge = (item.applied_options || []).reduce((sum, o) => sum + Number(o.price_delta || 0), 0);
      const baseUnit = typeof item.base_price === 'number' ? item.base_price : finalUnit - surcharge;
      const selectedOptions = (item.applied_options || [])
        .map((o) => `${o.group}: ${o.label}${Number(o.price_delta) > 0 ? ` (+$${aud(Number(o.price_delta))})` : ''}`)
        .join('; ');

      rows.push([
        order.payment_reference || order.id,
        new Date(order.created_at).toISOString(),
        melbourneDate.format(new Date(order.created_at)),
        order.merch_window_label || '',
        order.customer_name,
        order.customer_email,
        order.customer_phone || '',
        name,
        selectedOptions,
        item.size || '',
        quantity,
        item.custom_name || '',
        item.custom_number === undefined || item.custom_number === null ? '' : String(item.custom_number),
        aud(baseUnit),
        aud(surcharge),
        aud(finalUnit),
        aud(finalUnit * quantity),
        aud(Number(order.total_amount)),
        aud(amountPaid),
        aud(balance),
        order.payment_status,
        methods,
        references,
        order.processed ? 'yes' : 'no',
        order.notes || '',
      ]);
    }
  }

  return rows;
}
