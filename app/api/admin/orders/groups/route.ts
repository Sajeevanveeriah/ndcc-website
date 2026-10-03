import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';
import { purchaseGroup } from '@/lib/orders/purchase-groups';
import { loadEventTitles } from '@/lib/orders/event-titles-server';
import { fetchAllPages } from '@/lib/supabase-paginate';

export const dynamic = 'force-dynamic';

/**
 * Distinct purchase groups across every live order, for the admin purchase
 * tabs. Selects only the fields purchaseGroup() needs (category and the first
 * item's name and event id) and pages past PostgREST's 1000-row cap.
 */
export async function GET() {
  // Same gate as GET /api/admin/resources/orders.
  const user = await requirePermission('orders', ['admin', 'president', 'secretary', 'committee']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();
  const { data, error } = await fetchAllPages<{ order_category: string | null; first_item_name: string | null; first_item_event_id: string | null }>((from, to, stable) => {
    let query = supabase
      .from('orders')
      .select('order_category,first_item_name:items->0->>name,first_item_event_id:items->0->>event_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (stable) query = query.order('id', { ascending: true });
    return query.range(from, to);
  });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const eventTitles = await loadEventTitles(supabase);
  const groups = new Set<string>();
  for (const row of data) {
    groups.add(purchaseGroup({
      order_category: row.order_category,
      items: row.first_item_name || row.first_item_event_id ? [{ name: row.first_item_name || undefined, event_id: row.first_item_event_id }] : [],
    }, eventTitles));
  }
  return NextResponse.json({ success: true, data: Array.from(groups) }, { headers: { 'Cache-Control': 'no-store' } });
}
