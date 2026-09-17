import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { isThursdayServiceDate, kitchenOrdersCsv } from '@/lib/kitchen-export';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await requirePermission('kitchen');
  if (!user) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const date = new URL(request.url).searchParams.get('service_date') || '';
  if (!isThursdayServiceDate(date)) return NextResponse.json({ error: 'Choose a Thursday service date.' }, { status: 400 });

  const supabase = createServerClient();
  const orders: Parameters<typeof kitchenOrdersCsv>[0] = [];
  // Paginate so busy weeks are not silently truncated by the database row limit.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('orders')
      .select('customer_name,payment_reference,meal_service_date,meal_collection_window,payment_status,items').is('deleted_at', null)
      .eq('order_category', 'kitchen').eq('meal_service_date', date)
      .order('id', { ascending: true }).range(offset, offset + 499);
    if (error) return NextResponse.json({ error: 'Could not export orders. Please try again.' }, { status: 500 });
    orders.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return new Response(kitchenOrdersCsv(orders), { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="NDCC-Kitchen-${date}.csv"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}
