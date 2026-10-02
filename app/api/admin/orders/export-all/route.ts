import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';
import { toCsv } from '@/lib/csv';
import { buildAllOrdersExportRows, type AllOrdersExportOrder, type AllOrdersExportPayment } from '@/lib/orders/all-orders-export';
import { purchaseGroup } from '@/lib/orders/purchase-groups';

export const dynamic = 'force-dynamic';

const BASE_COLUMNS = 'id,created_at,payment_reference,order_category,customer_name,customer_email,customer_phone,items,total_amount,amount_paid,balance_due,payment_status,order_status,processed,notes,meal_service_date,bank_transfer_selected_at,bar_payment_selected_at';
const CHOICE_COLUMNS = 'payment_method_choice,payment_method_choice_source,payment_method_choice_by,payment_method_choice_at';

// All orders across every category with stated and settled payment methods.
// Optional filters: group (as on Admin > Orders, e.g. kitchen, merch,
// event:<name>), date_from / date_to (Melbourne dates, inclusive).
export async function GET(request: Request) {
  const user = await requirePermission('orders', ['admin', 'president', 'secretary']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const group = (searchParams.get('group') || '').slice(0, 200);
  const dateFrom = searchParams.get('date_from') || '';
  const dateTo = searchParams.get('date_to') || '';
  for (const date of [dateFrom, dateTo]) {
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ success: false, error: 'Enter dates as YYYY-MM-DD.' }, { status: 400 });
  }
  if (dateFrom && dateTo && dateFrom > dateTo) return NextResponse.json({ success: false, error: 'The from date must be on or before the to date.' }, { status: 400 });

  const supabase = createServerClient();
  const melbourneDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' });
  const orders: AllOrdersExportOrder[] = [];
  let columns = `${BASE_COLUMNS},${CHOICE_COLUMNS}`;
  const cutoff = new Date().toISOString();
  for (let offset = 0; ; offset += 500) {
    const page = (cols: string) => supabase.from('orders').select(cols).is('deleted_at', null).lte('created_at', cutoff)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 499);
    let result = await page(columns);
    // Before the payment method migration the stated method comes from the intent columns.
    if (result.error && columns !== BASE_COLUMNS && /payment_method_choice|schema cache|column/i.test(result.error.message || '')) {
      columns = BASE_COLUMNS;
      result = await page(columns);
    }
    if (result.error) return NextResponse.json({ success: false, error: 'Unable to load orders for export.' }, { status: 500 });
    const data = (result.data || []) as unknown as AllOrdersExportOrder[];
    for (const order of data) {
      if (group && purchaseGroup({ order_category: order.order_category, items: order.items || undefined }) !== group) continue;
      const day = melbourneDay.format(new Date(order.created_at));
      if (dateFrom && day < dateFrom) continue;
      if (dateTo && day > dateTo) continue;
      orders.push(order);
    }
    if (data.length < 500) break;
  }
  if (orders.length === 0) return NextResponse.json({ success: false, error: 'No orders match these filters.' }, { status: 404 });

  const payments: AllOrdersExportPayment[] = [];
  for (let start = 0; start < orders.length; start += 100) {
    const ids = orders.slice(start, start + 100).map((order) => order.id);
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from('order_payments').select('order_id,method,status,amount')
        .in('order_id', ids).order('id', { ascending: true }).range(offset, offset + 499);
      if (error) return NextResponse.json({ success: false, error: 'Unable to load payment details for export. Please try again.' }, { status: 500 });
      payments.push(...((data || []) as AllOrdersExportPayment[]));
      if (!data || data.length < 500) break;
    }
  }

  const today = melbourneDay.format(new Date()).replace(/-/g, '');
  const suffix = group ? `-${group.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40)}` : '';
  return new NextResponse(toCsv(buildAllOrdersExportRows(orders, payments)), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${today}-NDCC-All-Orders${suffix}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
