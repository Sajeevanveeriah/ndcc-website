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

export function kitchenOrdersCsv(orders: Array<{
  customer_name: string; payment_reference: string | null; meal_service_date: string;
  meal_collection_window: string | null; payment_status: string;
  items: Array<{ name?: string; quantity?: number }> | null;
}>): string {
  const rows: unknown[][] = [['Service date', 'Order reference', 'Purchaser name', 'Collection window', 'Meal', 'Quantity', 'Payment status']];
  for (const order of orders) {
    const window = order.meal_collection_window === 'juniors' ? 'Juniors - 6:00 pm' : order.meal_collection_window === 'seniors' ? 'Seniors - 7:30 pm' : 'Collection time not recorded';
    for (const item of order.items?.length ? order.items : [{ name: 'Order items not recorded' }]) {
      rows.push([order.meal_service_date, order.payment_reference, order.customer_name, window, item.name, item.quantity, order.payment_status]);
    }
  }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
