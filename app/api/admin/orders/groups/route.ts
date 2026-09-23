import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';
import { purchaseGroup } from '@/lib/orders/purchase-groups';
import { fetchAllPages } from '@/lib/supabase-paginate';

export const dynamic = 'force-dynamic';

/**
 * Distinct purchase groups across every live order, for the admin purchase
 * tabs. Selects only the two fields purchaseGroup() needs (category and the
 * first item name) and pages past PostgREST's 1000-row cap.
 */
export async function GET() {
  // Same gate as GET /api/admin/resources/orders.
  const user = await requirePermission('orders', ['admin', 'president', 'secretary', 'committee']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();
  const { data, error } = await fetchAllPages<{ order_category: string | null; first_item_name: string | null }>((from, to, stable) => {
    let query = supabase
      .from('orders')
      .select('order_category,first_item_name:items->0->>name')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (stable) query = query.order('id', { ascending: true });
    return query.range(from, to);
  });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const groups = new Set<string>();
  for (const row of data) {
    groups.add(purchaseGroup({
      order_category: row.order_category,
      items: row.first_item_name ? [{ name: row.first_item_name }] : [],
    }));
  }
  return NextResponse.json({ success: true, data: Array.from(groups) }, { headers: { 'Cache-Control': 'no-store' } });
}
