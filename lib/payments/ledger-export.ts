// Payment-ledger CSV row building. This module stays free of I/O so the
// financial export shape can be regression-tested without Supabase or Next.js.

export type PaymentLedgerOrder = {
  id: string;
  payment_reference?: string | null;
  order_category?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  total_amount?: number | string | null;
  amount_paid?: number | string | null;
  balance_due?: number | string | null;
  payment_status?: string | null;
  created_at?: string | null;
};

export type PaymentLedgerExportRow = {
  id: string;
  order_id: string;
  payment_reference?: string | null;
  amount: number | string;
  currency?: string | null;
  method?: string | null;
  provider?: string | null;
  provider_reference?: string | null;
  provider_event_id?: string | null;
  status?: string | null;
  received_at?: string | null;
  recorded_by?: string | null;
  notes?: string | null;
  reverses_payment_id?: string | null;
  source_transaction_id?: string | null;
  client_operation_id?: string | null;
  created_at?: string | null;
  order?: PaymentLedgerOrder | PaymentLedgerOrder[] | null;
};

export const PAYMENT_LEDGER_EXPORT_HEADER = [
  'item_number',
  'payment_reference',
  'payment_id',
  'payment_created_at',
  'payment_received_at',
  'payment_status',
  'amount_aud',
  'currency',
  'method',
  'provider',
  'provider_reference',
  'provider_event_id',
  'reverses_payment_id',
  'source_transaction_id',
  'client_operation_id',
  'recorded_by',
  'notes',
  'order_id',
  'order_reference',
  'order_category',
  'customer_name',
  'customer_email',
  'customer_phone',
  'order_total_aud',
  'order_amount_paid_aud',
  'order_balance_due_aud',
  'order_payment_status',
  'order_created_at',
] as const;

export function paymentLedgerFilename(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const value = (type: 'year' | 'month' | 'day') => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}${value('month')}${value('day')}-NDCC-Payment-Ledger-Rev01.csv`;
}

function aud(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : '';
}

function joinedOrder(row: PaymentLedgerExportRow): PaymentLedgerOrder | null {
  if (Array.isArray(row.order)) return row.order[0] || null;
  return row.order || null;
}

export function buildPaymentLedgerExportRows(
  payments: PaymentLedgerExportRow[],
): Array<Array<string>> {
  const rows: Array<Array<string>> = [[...PAYMENT_LEDGER_EXPORT_HEADER]];

  for (const payment of payments) {
    const order = joinedOrder(payment);
    // payment_reference is the canonical, unique club item number. Historic
    // ledger rows can legitimately be blank and must not be assigned an
    // invented identity during export.
    const itemNumber = payment.payment_reference || '';

    rows.push([
      itemNumber,
      itemNumber,
      payment.id,
      payment.created_at || '',
      payment.received_at || '',
      payment.status || '',
      aud(payment.amount),
      payment.currency || '',
      payment.method || '',
      payment.provider || '',
      payment.provider_reference || '',
      payment.provider_event_id || '',
      payment.reverses_payment_id || '',
      payment.source_transaction_id || '',
      payment.client_operation_id || '',
      payment.recorded_by || '',
      payment.notes || '',
      payment.order_id,
      order?.payment_reference || '',
      order?.order_category || '',
      order?.customer_name || '',
      order?.customer_email || '',
      order?.customer_phone || '',
      aud(order?.total_amount),
      aud(order?.amount_paid),
      aud(order?.balance_due),
      order?.payment_status || '',
      order?.created_at || '',
    ]);
  }

  return rows;
}
