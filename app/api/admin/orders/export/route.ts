import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';
import { toCsv } from '@/lib/csv';
import { buildMerchExportRows, type ExportFilters, type ExportOrder, type ExportPayment } from '@/lib/orders/export';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await requirePermission('orders', ['admin', 'president', 'secretary']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const filters: ExportFilters = {
    windowId: searchParams.get('window_id'),
    dateFrom: searchParams.get('date_from'),
    dateTo: searchParams.get('date_to'),
    paymentStatus: searchParams.get('payment_status'),
    processed: (searchParams.get('processed') as 'true' | 'false' | null),
    product: searchParams.get('product'),
    paidInFullOnly: !searchParams.get('payment_status') && searchParams.get('paid_in_full_only') === '1',
    includePartPaid: Boolean(searchParams.get('payment_status')) || searchParams.get('include_part_paid') !== '0',
  };
  if (filters.paymentStatus && !['paid', 'part_paid', 'unpaid', 'needs_review', 'refunded', 'partially_refunded'].includes(filters.paymentStatus)) {
    return NextResponse.json({ success: false, error: 'Choose a valid payment status.' }, { status: 400 });
  }
  for (const date of [filters.dateFrom, filters.dateTo]) {
    if (date && !Number.isFinite(Date.parse(date))) return NextResponse.json({ success: false, error: 'Enter a valid date range.' }, { status: 400 });
  }
  if (filters.dateFrom && filters.dateTo && new Date(filters.dateFrom) > new Date(filters.dateTo)) {
    return NextResponse.json({ success: false, error: 'The from date must be on or before the to date.' }, { status: 400 });
  }

  const supabase = createServerClient();
  // This is a financial report. The supplier workbook at /api/admin/merch/export
  // separately enforces full payment before an order can be processed.
  const orders: ExportOrder[] = [];
  const cutoff = new Date().toISOString();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('orders')
      .select('id,created_at,payment_reference,merch_window_label,merch_window_id,customer_name,customer_email,customer_phone,items,total_amount,amount_paid,balance_due,payment_status,processed,order_status,notes')
      .is('deleted_at', null).eq('order_category', 'merch').lte('created_at', cutoff)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 499);
    if (error) return NextResponse.json({ success: false, error: 'Unable to load orders for export.' }, { status: 500 });
    orders.push(...(data || []) as ExportOrder[]);
    if (!data || data.length < 500) break;
  }

  const payments: ExportPayment[] = [];
  for (let start = 0; start < orders.length; start += 100) {
    const ids = orders.slice(start, start + 100).map(order => order.id);
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from('order_payments')
        .select('order_id,method,status,provider_reference').in('order_id', ids)
        .order('id', { ascending: true }).range(offset, offset + 499);
      if (error) return NextResponse.json({ success: false, error: 'Unable to load payment details for export. Please try again.' }, { status: 500 });
      payments.push(...(data || []) as ExportPayment[]);
      if (!data || data.length < 500) break;
    }
  }

  const rows = buildMerchExportRows(orders, payments, filters);
  if (rows.length === 1) return NextResponse.json({ success: false, error: 'No order items match these export filters. Check the payment status and date range.' }, { status: 404 });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ndcc-merchandise-payments-${filters.paymentStatus || 'all'}-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
