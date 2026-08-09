export type SupplierExportOrder = {
  customer_name: string;
  created_at: string;
  merch_window_label?: string | null;
  order_status?: string | null;
  items: Array<{
    name?: string;
    size?: string;
    quantity?: number;
    applied_options?: Array<{ group: string; label: string }>;
    custom_name?: string;
    custom_number?: number;
    alternate_number?: number;
    number_request_status?: string;
  }>;
};

export const SUPPLIER_EXPORT_HEADER = [
  'customer',
  'product',
  'size',
  'quantity',
  'order_date',
  'window_label',
  'status',
  'selected_options',
  'surname',
  'first_number_preference',
  'second_number_preference',
  'number_request_status',
];

export function buildSupplierExportRows(orders: SupplierExportOrder[]): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [SUPPLIER_EXPORT_HEADER];
  for (const order of orders) {
    for (const item of Array.isArray(order.items) ? order.items : []) {
      const selectedOptions = (item.applied_options || [])
        .map((option) => `${option.group}: ${option.label}`)
        .join('; ');
      rows.push([
        order.customer_name || '',
        item.name || '',
        item.size || '',
        Number(item.quantity || 0),
        order.created_at || '',
        order.merch_window_label || '',
        order.order_status || '',
        selectedOptions,
        item.custom_name || '',
        item.custom_number === undefined ? '' : String(item.custom_number),
        item.alternate_number === undefined ? '' : String(item.alternate_number),
        item.number_request_status || '',
      ]);
    }
  }
  return rows;
}
