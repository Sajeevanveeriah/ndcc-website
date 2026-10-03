import type { createServerClient } from '@/lib/supabase-server';
import { eventTitleMap, type EventTitles } from '@/lib/orders/purchase-groups';

/**
 * Current event titles for purchase grouping. On a lookup failure grouping
 * falls back to the item names stored on each order, which is the behaviour
 * before event ids were recorded, so callers never fail because of it.
 */
export async function loadEventTitles(supabase: ReturnType<typeof createServerClient>): Promise<EventTitles> {
  const { data, error } = await supabase.from('events').select('id,title');
  if (error) {
    console.error('Event title lookup for purchase groups failed:', error.message);
    return new Map();
  }
  return eventTitleMap(data as Array<{ id: string; title: string }> | null);
}
