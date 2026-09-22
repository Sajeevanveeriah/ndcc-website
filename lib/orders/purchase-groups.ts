type GroupOrder = { order_category?: string | null; items?: Array<{ name?: string }> };

export function purchaseGroup(order: GroupOrder): string {
  const category = order.order_category || 'other';
  return category === 'event' ? `event:${order.items?.[0]?.name || 'Other events'}` : category;
}

export function purchaseGroupLabel(group: string): string {
  if (group.startsWith('event:')) return group.slice(6);
  return ({ merch: 'Apparel / merchandise', kitchen: 'Kitchen', donation: 'Donations', membership: 'Memberships', other: 'Other purchases' } as Record<string, string>)[group]
    || group.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}
