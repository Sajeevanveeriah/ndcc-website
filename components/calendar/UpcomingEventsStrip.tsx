import Link from 'next/link';
import type { CalendarFeedEvent } from '@/lib/calendar/types';
import CalendarEventCard from './CalendarEventCard';

type UpcomingEventsStripProps = {
  events: CalendarFeedEvent[];
  heading?: string;
  compact?: boolean;
  showViewAll?: boolean;
  emptyMessage?: string | null;
};

/**
 * Presentational list of upcoming calendar events. Server components pass
 * server-fetched data; client pages can pass API-fetched data. Renders nothing
 * when there are no events and no empty message is requested — never stale
 * placeholder content.
 */
export default function UpcomingEventsStrip({
  events,
  heading,
  compact = false,
  showViewAll = true,
  emptyMessage = null,
}: UpcomingEventsStripProps) {
  if (events.length === 0 && !emptyMessage) return null;

  return (
    <div>
      {heading && (
        <h3 className="font-display font-bold uppercase tracking-wide text-maroon-800 text-lg mb-3">{heading}</h3>
      )}
      {events.length === 0 ? (
        <p className="text-sm font-body text-gray-500">{emptyMessage}</p>
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event.id}>
              <CalendarEventCard event={event} compact={compact} />
            </li>
          ))}
        </ul>
      )}
      {showViewAll && (
        <div className="mt-4">
          <Link
            href="/calendar"
            className="inline-flex items-center text-maroon-700 hover:text-maroon-500 font-body font-semibold text-sm transition-colors"
          >
            View full calendar →
          </Link>
        </div>
      )}
    </div>
  );
}
