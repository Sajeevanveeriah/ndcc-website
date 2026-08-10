import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';
import { toCsv } from '@/lib/csv';
import {
  buildSupplierExportRows,
  type SupplierExportOrder,
} from '@/lib/orders/supplier-export';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requirePermission('merchandise', ['admin']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('orders')
    .select('customer_name,items,created_at,merch_window_label,order_status,order_category')
    .eq('order_category', 'merch')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const rows = buildSupplierExportRows((data || []) as unknown as SupplierExportOrder[]);
  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ndcc-merch-supplier-export.csv"',
    },
  });
}
