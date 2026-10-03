'use client';

import { useEffect, useState } from 'react';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import { eventTitleMap, type EventTitles } from '@/lib/orders/purchase-groups';

/** Current event titles for grouping event orders in the admin purchase tabs. */
export function useEventTitles(): EventTitles {
  const [titles, setTitles] = useState<EventTitles>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/admin/resources/events', { cache: 'no-store' })
      .then((response) => parseApiResponse<{ data: Array<{ id: string; title: string }> }>(response))
      .then((result) => { if (!cancelled) setTitles(eventTitleMap(result.data)); })
      // Grouping falls back to the stored item names when titles are unavailable.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return titles;
}
