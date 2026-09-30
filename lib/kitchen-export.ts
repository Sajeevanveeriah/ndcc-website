export function isThursdayServiceDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 4;
}

/** Quote every cell and neutralise spreadsheet formulas in customer-controlled text. */
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

type KitchenExportOrder = {
  customer_name: string; payment_reference: string | null; meal_service_date: string;
  meal_collection_window: string | null; payment_status: string;
  items: Array<{ name?: string; quantity?: number }> | null;
  total_amount?: number | string | null; amount_paid?: number | string | null; balance_due?: number | string | null;
  bar_payment_selected_at?: string | null; bank_transfer_selected_at?: string | null;
  customer_email?: string | null;
};

/** Settled status wins; otherwise the purchaser's recorded intent, bar before bank. */
export function kitchenPaymentMethod(order: KitchenExportOrder): string {
  if (order.payment_status === 'paid') return 'Paid';
  if (order.bar_payment_selected_at) return 'Pay cash at the bar';
  if (order.bank_transfer_selected_at) return 'Bank transfer - awaiting receipt';
  return 'Not yet paid';
}

/** Amount still owed, from balance_due when recorded, else total less amount paid. */
export function kitchenAmountDue(order: KitchenExportOrder): number {
  if (order.payment_status === 'paid') return 0;
  const due = order.balance_due ?? Number(order.total_amount ?? 0) - Number(order.amount_paid ?? 0);
  return Math.max(0, Math.round(Number(due) * 100) / 100);
}

/**
 * An unpaid order whose purchaser email also has another order for the same
 * service may be an abandoned retry (for example after a failed card payment
 * in another browser). It is only flagged for staff to check, never removed.
 */
export function possibleDuplicateNote(order: KitchenExportOrder, orders: KitchenExportOrder[]): string {
  const email = (order.customer_email ?? '').trim().toLowerCase();
  if (!email || order.payment_status === 'paid') return '';
  const others = orders.filter((other) => other !== order && other.meal_service_date === order.meal_service_date
    && (other.customer_email ?? '').trim().toLowerCase() === email);
  return others.length ? `Possible duplicate: same email as ${others.map((other) => other.payment_reference || 'another order').join(', ')}` : '';
}

export function kitchenOrdersCsv(orders: KitchenExportOrder[]): string {
  const rows: unknown[][] = [['Service date', 'Order reference', 'Purchaser name', 'Collection window', 'Meal', 'Quantity', 'Payment status', 'Payment method', 'Order total', 'Collect at bar', 'Check']];
  for (const order of orders) {
    const check = possibleDuplicateNote(order, orders);
    const window = order.meal_collection_window === 'juniors' ? 'Juniors - 6:00 pm' : order.meal_collection_window === 'seniors' ? 'Seniors - 7:30 pm' : 'Collection time not recorded';
    const method = kitchenPaymentMethod(order);
    const total = Number(order.total_amount ?? 0).toFixed(2);
    // Money columns sit on the order's first row only, so summing a column never double counts.
    const atBar = method === 'Pay cash at the bar' ? kitchenAmountDue(order).toFixed(2) : '';
    (order.items?.length ? order.items : [{ name: 'Order items not recorded' }]).forEach((item, index) => {
      rows.push([order.meal_service_date, order.payment_reference, order.customer_name, window, item.name, item.quantity, order.payment_status,
        method, index === 0 ? total : '', index === 0 ? atBar : '', index === 0 ? check : '']);
    });
  }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
