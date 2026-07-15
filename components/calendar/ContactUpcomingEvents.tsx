'use client';

import { useEffect, useState } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import UpcomingEventsStrip from './UpcomingEventsStrip';
import type { CalendarFeedEvent } from '@/lib/calendar/types';

/**
 * Compact "Upcoming at the club" card for the contact page. Fetches live
 * calendar entries flagged show_on_contact; renders nothing while loading,
 * on error, or when there are no events — never stale placeholder content.
 */
export default function ContactUpcomingEvents({ limit = 3 }: { limit?: number }) {
  const [events, setEvents] = useState<CalendarFeedEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/public/calendar/upcoming?contact=1&limit=${limit}`, { cache: 'no-store' });
        if (!response.ok) return;
        const json = await response.json();
        if (!cancelled && json?.success && Array.isArray(json.data)) {
          setEvents(json.data as CalendarFeedEvent[]);
        }
      } catch {
        // Silent: the contact page must not degrade because the calendar is unavailable.
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  if (!events || events.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-xl font-display font-bold text-content-primary mb-4">Upcoming at the Club</h3>
        <UpcomingEventsStrip events={events} compact />
      </CardContent>
    </Card>
  );
}
