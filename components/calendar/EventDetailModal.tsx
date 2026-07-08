'use client';

import Link from 'next/link';
import { MapPin, Clock, Ticket, Users } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import SafeImage from '@/components/common/SafeImage';
import type { CalendarFeedEvent } from '@/lib/calendar/types';
import { CALENDAR_EVENT_TYPE_LABELS } from '@/lib/calendar/types';
import { formatEventDateRange } from '@/lib/calendar/format';
import { formatCurrency } from '@/lib/utils';

type EventDetailModalProps = {
  event: CalendarFeedEvent | null;
  onClose: () => void;
};

export default function EventDetailModal({ event, onClose }: EventDetailModalProps) {
  if (!event) return null;

  const props = event.extendedProps;
  const dateLabel = formatEventDateRange({ start_at: event.start, end_at: event.end, all_day: event.allDay });
  const ctaUrl = props.ctaUrl || event.url;
  const ctaExternal = !!ctaUrl && /^https?:\/\//.test(ctaUrl);

  return (
    <Modal isOpen onClose={onClose} title={event.title} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">{CALENDAR_EVENT_TYPE_LABELS[props.eventType] ?? props.eventType}</Badge>
          {props.category && <Badge variant="default">{props.category}</Badge>}
          {props.isFeatured && <Badge variant="warning">Featured</Badge>}
          {props.status === 'cancelled' && <Badge variant="danger">Cancelled</Badge>}
          {props.status === 'postponed' && <Badge variant="warning">Postponed</Badge>}
        </div>

        {props.imageUrl && (
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg bg-gray-50">
            <SafeImage
              src={props.imageUrl}
              alt={`${event.title} event artwork`}
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 640px"
              fallback={<div className="absolute inset-0 bg-gray-50" aria-hidden="true" />}
            />
          </div>
        )}

        <div className="space-y-2 text-sm font-body text-gray-700">
          <p className="flex items-start gap-2">
            <Clock className="h-4 w-4 mt-0.5 text-maroon-700 shrink-0" aria-hidden="true" />
            <span>
              {dateLabel}
              <span className="block text-xs text-gray-500">Melbourne time (AEST/AEDT)</span>
            </span>
          </p>
          {(props.location || props.venueAddress) && (
            <p className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 text-maroon-700 shrink-0" aria-hidden="true" />
              <span>
                {props.location}
                {props.venueAddress && <span className="block text-xs text-gray-500">{props.venueAddress}</span>}
              </span>
            </p>
          )}
          {props.ticketPrice !== null && props.ticketPrice !== undefined && (
            <p className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-maroon-700 shrink-0" aria-hidden="true" />
              {Number(props.ticketPrice) > 0 ? formatCurrency(Number(props.ticketPrice)) : 'Free'}
            </p>
          )}
          {props.capacity !== null && props.capacity !== undefined && (
            <p className="flex items-center gap-2">
              <Users className="h-4 w-4 text-maroon-700 shrink-0" aria-hidden="true" />
              Capacity {props.capacity}
            </p>
          )}
        </div>

        {props.description && (
          <p className="text-sm font-body text-gray-700 leading-relaxed whitespace-pre-line">{props.description}</p>
        )}

        {props.registrationRequired && (
          <p className="text-xs font-body font-semibold uppercase tracking-wide text-maroon-800">
            Registration required
          </p>
        )}

        {ctaUrl && props.status !== 'cancelled' && (
          <div className="pt-2 border-t border-gray-100">
            {ctaExternal ? (
              <a href={ctaUrl} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex">
                {props.ctaLabel || 'More details'}
              </a>
            ) : (
              <Link href={ctaUrl} className="btn-primary inline-flex">
                {props.ctaLabel || 'More details'}
              </Link>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
