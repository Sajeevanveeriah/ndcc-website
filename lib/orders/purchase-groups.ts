type GroupItem = { name?: string; event_id?: string | null };
type GroupOrder = { order_category?: string | null; items?: GroupItem[] };

/** Current event titles keyed by event id (events.id -> events.title). */
export type EventTitles = ReadonlyMap<string, string>;

export function eventTitleMap(events: ReadonlyArray<{ id?: string | null; title?: string | null }> | null | undefined): EventTitles {
  const titles = new Map<string, string>();
  for (const event of events || []) {
    if (event?.id && event.title) titles.set(String(event.id), String(event.title));
  }
  return titles;
}

/**
 * Purchase group (admin tab key) for an order. Event orders group by the
 * event's current title, resolved through the event_id stored on the order
 * item, so renaming an event keeps all of its orders in one tab. Orders
 * without an event_id (or an unknown one) fall back to the item name that was
 * stored at purchase time.
 */
export function purchaseGroup(order: GroupOrder, eventTitles?: EventTitles): string {
  const category = order.order_category || 'other';
  if (category !== 'event') return category;
  const first = order.items?.[0];
  const currentTitle = first?.event_id ? eventTitles?.get(String(first.event_id)) : undefined;
  return `event:${currentTitle || first?.name || 'Other events'}`;
}

export function purchaseGroupLabel(group: string): string {
  if (group.startsWith('event:')) return group.slice(6);
  return ({ merch: 'Apparel / merchandise', kitchen: 'Kitchen', donation: 'Donations', membership: 'Memberships', other: 'Other purchases' } as Record<string, string>)[group]
    || group.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}
