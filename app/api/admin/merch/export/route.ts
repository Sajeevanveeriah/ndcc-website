import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

function esc(value: string | number | null | undefined) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export async function GET() {
  const user = await requireSession(['admin']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('orders')
    .select('customer_name,items,created_at,merch_window_label,order_status,order_category')
    .eq('order_category', 'merch')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const rows: string[] = [];
  for (const order of data || []) {
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      rows.push([
        esc(order.customer_name),
        esc(item?.name),
        esc(item?.size),
        esc(item?.quantity),
        esc(order.created_at),
        esc(order.merch_window_label),
        esc(order.order_status),
      ].join(','));
    }
  }

  const header = ['customer', 'product', 'size', 'quantity', 'order_date', 'window_label', 'status'].join(',');
  return new NextResponse([header, ...rows].join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ndcc-merch-supplier-export.csv"',
    },
  });
}
