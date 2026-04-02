import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';

function csvEscape(value: string | number | null | undefined) {
  const str = String(value ?? '');
  return `"${str.replace(/"/g, '""')}"`;
}

export async function GET() {
  const user = await requireSession(['admin']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('orders')
    .select('id, customer_name, customer_email, total_amount, payment_status, payment_reference, created_at, confirmed_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const header = ['order_id', 'customer_name', 'customer_email', 'total_amount', 'payment_status', 'payment_reference', 'created_at', 'confirmed_at'];
  const rows = (data || []).map((row) => [
    csvEscape(row.id),
    csvEscape(row.customer_name),
    csvEscape(row.customer_email),
    csvEscape(row.total_amount),
    csvEscape(row.payment_status),
    csvEscape(row.payment_reference),
    csvEscape(row.created_at),
    csvEscape(row.confirmed_at),
  ].join(','));

  const csv = [header.join(','), ...rows].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ndcc-xero-reconciliation.csv"',
    },
  });
}
