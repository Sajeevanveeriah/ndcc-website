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
    paidInFullOnly: searchParams.get('paid_in_full_only') === '1',
    includePartPaid: searchParams.get('include_part_paid') !== '0',
  };

  const supabase = createServerClient();
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id,created_at,payment_reference,merch_window_label,merch_window_id,customer_name,customer_email,customer_phone,items,total_amount,amount_paid,balance_due,payment_status,processed,order_status,notes')
    .eq('order_category', 'merch')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  let payments: ExportPayment[] = [];
  const { data: paymentRows, error: paymentsError } = await supabase
    .from('order_payments')
    .select('order_id,method,status,provider_reference')
    .limit(5000);
  if (!paymentsError && Array.isArray(paymentRows)) {
    payments = paymentRows as ExportPayment[];
  }

  const rows = buildMerchExportRows((orders ?? []) as ExportOrder[], payments, filters);
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ndcc-merchandise-orders-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
