import Link from 'next/link';
import { MapPin } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import type { CalendarFeedEvent } from '@/lib/calendar/types';
import { CALENDAR_EVENT_TYPE_LABELS } from '@/lib/calendar/types';
import { formatEventDateRange } from '@/lib/calendar/format';
import { truncateText } from '@/lib/utils';

type CalendarEventCardProps = {
  event: CalendarFeedEvent;
  compact?: boolean;
};

export default function CalendarEventCard({ event, compact = false }: CalendarEventCardProps) {
  const props = event.extendedProps;
  const dateLabel = formatEventDateRange({ start_at: event.start, end_at: event.end, all_day: event.allDay });
  const cancelled = props.status === 'cancelled';
  const postponed = props.status === 'postponed';

  const body = (
    <article
      className={`flex gap-3 rounded-xl border bg-surface-card p-4 shadow-soft transition-shadow hover:shadow-card ${
        props.isFeatured && !cancelled ? 'border-gold-400' : 'border-edge-subtle'
      }`}
    >
      <span
        className="mt-1 h-full w-1 shrink-0 rounded-full"
        style={{ backgroundColor: event.backgroundColor, minHeight: '2.5rem' }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-body font-semibold uppercase tracking-[0.08em] text-maroon-700 dark:text-maroon-200">{dateLabel}</p>
        <h3
          className={`mt-0.5 font-display font-bold text-content-primary ${compact ? 'text-base' : 'text-lg'} ${
            cancelled ? 'line-through text-content-muted' : ''
          }`}
        >
          {event.title}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-body text-content-muted">
          <Badge className="!text-[10px]">{CALENDAR_EVENT_TYPE_LABELS[props.eventType] ?? props.eventType}</Badge>
          {cancelled && <Badge variant="danger">Cancelled</Badge>}
          {postponed && <Badge variant="warning">Postponed</Badge>}
          {props.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {props.location}
            </span>
          )}
        </div>
        {!compact && props.description && (
          <p className="mt-2 text-sm font-body text-content-muted leading-relaxed">{truncateText(props.description, 120)}</p>
        )}
      </div>
    </article>
  );

  const ctaUrl = props.ctaUrl || event.url;
  if (ctaUrl && !cancelled) {
    return /^https?:\/\//.test(ctaUrl) ? (
      <a href={ctaUrl} target="_blank" rel="noopener noreferrer" className="block focus-ring rounded-xl">
        {body}
      </a>
    ) : (
      <Link href={ctaUrl} className="block focus-ring rounded-xl">
        {body}
      </Link>
    );
  }
  return body;
}
