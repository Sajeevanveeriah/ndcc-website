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

export function kitchenOrdersCsv(orders: KitchenExportOrder[]): string {
  const rows: unknown[][] = [['Service date', 'Order reference', 'Purchaser name', 'Collection window', 'Meal', 'Quantity', 'Payment status', 'Payment method', 'Order total', 'Collect at bar']];
  for (const order of orders) {
    const window = order.meal_collection_window === 'juniors' ? 'Juniors - 6:00 pm' : order.meal_collection_window === 'seniors' ? 'Seniors - 7:30 pm' : 'Collection time not recorded';
    const method = kitchenPaymentMethod(order);
    const total = Number(order.total_amount ?? 0).toFixed(2);
    // Money columns sit on the order's first row only, so summing a column never double counts.
    const atBar = method === 'Pay cash at the bar' ? kitchenAmountDue(order).toFixed(2) : '';
    (order.items?.length ? order.items : [{ name: 'Order items not recorded' }]).forEach((item, index) => {
      rows.push([order.meal_service_date, order.payment_reference, order.customer_name, window, item.name, item.quantity, order.payment_status,
        method, index === 0 ? total : '', index === 0 ? atBar : '']);
    });
  }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
