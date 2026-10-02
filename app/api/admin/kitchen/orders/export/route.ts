import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { isThursdayServiceDate, kitchenOrdersCsv } from '@/lib/kitchen-export';
import { kitchenSpecialRequest } from '@/lib/kitchen-special-request';

export const dynamic = 'force-dynamic';
const EXPORT_COLUMNS = 'id,customer_name,payment_reference,meal_service_date,meal_collection_window,payment_status,items,total_amount,amount_paid,balance_due,bank_transfer_selected_at,bar_payment_selected_at,customer_email,meal_request';

export async function GET(request: Request) {
  const user = await requirePermission('kitchen');
  if (!user) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const date = new URL(request.url).searchParams.get('service_date') || '';
  if (!isThursdayServiceDate(date)) return NextResponse.json({ error: 'Choose a Thursday service date.' }, { status: 400 });

  const supabase = createServerClient();
  const orders: Array<Parameters<typeof kitchenOrdersCsv>[0][number] & { id: string }> = [];
  // The recorded payment method column arrives with its migration; until then
  // the stated method comes from the intent columns.
  let columns = `${EXPORT_COLUMNS},payment_method_choice`;
  // Paginate so busy weeks are not silently truncated by the database row limit.
  for (let offset = 0; ; offset += 500) {
    let result = await supabase.from('orders')
      .select(columns).is('deleted_at', null)
      .eq('order_category', 'kitchen').eq('meal_service_date', date)
      .order('id', { ascending: true }).range(offset, offset + 499);
    if (result.error && columns !== EXPORT_COLUMNS && /payment_method_choice|schema cache|column/i.test(result.error.message || '')) {
      columns = EXPORT_COLUMNS;
      result = await supabase.from('orders')
        .select(columns).is('deleted_at', null)
        .eq('order_category', 'kitchen').eq('meal_service_date', date)
        .order('id', { ascending: true }).range(offset, offset + 499);
    }
    const { data, error } = result as unknown as { data: Array<Record<string, unknown>> | null; error: { message: string } | null };
    if (error) return NextResponse.json({ error: 'Could not export orders. Please try again.' }, { status: 500 });
    orders.push(...(data ?? []).map(({ meal_request, ...order }) => ({ ...(order as unknown as Parameters<typeof kitchenOrdersCsv>[0][number] & { id: string }), special_request: kitchenSpecialRequest(meal_request) })));
    if (!data || data.length < 500) break;
  }
  // How settled payments arrived ("Paid by"), from the payment ledger. A failed
  // read leaves the column blank rather than blocking the export.
  const paidBy = new Map<string, string[]>();
  for (let start = 0; start < orders.length; start += 100) {
    const { data, error } = await supabase.from('order_payments').select('order_id,method')
      .in('order_id', orders.slice(start, start + 100).map((order) => order.id)).eq('status', 'settled');
    if (error) { console.error('Kitchen export payment methods unavailable:', error.message); break; }
    for (const row of data ?? []) paidBy.set(row.order_id, [...(paidBy.get(row.order_id) || []), row.method]);
  }
  for (const order of orders) order.paid_by = paidBy.get(order.id) || [];
  return new Response(kitchenOrdersCsv(orders), { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="NDCC-Kitchen-${date}.csv"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}
