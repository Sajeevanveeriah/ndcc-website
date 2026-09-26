'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { EventClickArg } from '@fullcalendar/core';
import type { CalendarFeedEvent } from '@/lib/calendar/types';
import { utcToMelbourneFloating } from '@/lib/calendar/format';
import CalendarFilters from './CalendarFilters';
import CalendarLegend from './CalendarLegend';
import EventDetailModal from './EventDetailModal';
import './calendar-theme.css';

function CalendarLoading() {
  return (
    <div className="py-24 text-center text-sm text-content-muted font-body" role="status">
      Loading calendar...
    </div>
  );
}

// FullCalendar is large and browser-only: load it on demand after hydration.
const FullCalendarView = dynamic(() => import('./FullCalendarView'), {
  ssr: false,
  loading: CalendarLoading,
});

type NdccCalendarProps = {
  events: CalendarFeedEvent[];
  showFilters?: boolean;
  showLegend?: boolean;
};

export default function NdccCalendar({ events, showFilters = true, showLegend = true }: NdccCalendarProps) {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CalendarFeedEvent | null>(null);

  useEffect(() => {
    setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
    setMounted(true);
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((event) => {
      if (activeTypes.length > 0 && !activeTypes.includes(event.extendedProps.eventType)) return false;
      if (!term) return true;
      const haystack = [
        event.title,
        event.extendedProps.location ?? '',
        event.extendedProps.description ?? '',
        event.extendedProps.category ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [events, activeTypes, search]);

  const calendarEvents = useMemo(
    () =>
      filtered.map((event) => ({
        id: event.id,
        title: event.title,
        // Floating Melbourne wall-clock strings: every visitor sees club time.
        start: event.allDay ? utcToMelbourneFloating(event.start).slice(0, 10) : utcToMelbourneFloating(event.start),
        end: event.end
          ? event.allDay
            ? utcToMelbourneFloating(event.end).slice(0, 10)
            : utcToMelbourneFloating(event.end)
          : undefined,
        allDay: event.allDay,
        backgroundColor: event.backgroundColor,
        borderColor: event.borderColor,
        textColor: event.textColor,
        classNames: [
          event.extendedProps.status === 'cancelled' || event.extendedProps.status === 'postponed'
            ? 'ndcc-event-cancelled'
            : '',
          event.extendedProps.isFeatured ? 'ndcc-event-featured' : '',
        ].filter(Boolean),
        extendedProps: event.extendedProps,
      })),
    [filtered]
  );

  const handleEventClick = (arg: EventClickArg) => {
    arg.jsEvent.preventDefault();
    const match = events.find((event) => event.id === arg.event.id);
    if (match) setSelected(match);
  };

  return (
    <div>
      {showFilters && (
        <CalendarFilters
          activeTypes={activeTypes}
          onTypesChange={setActiveTypes}
          search={search}
          onSearchChange={setSearch}
        />
      )}

      <div className="ndcc-calendar bg-surface-card rounded-xl border border-edge-subtle shadow-card p-3 sm:p-5">
        {!mounted ? (
          <CalendarLoading />
        ) : (
          <FullCalendarView events={calendarEvents} isMobile={isMobile} onEventClick={handleEventClick} />
        )}
      </div>

      <p className="mt-2 text-xs text-content-muted font-body">All times shown in Melbourne time (AEST/AEDT).</p>

      {showLegend && <CalendarLegend className="mt-4" />}

      <EventDetailModal event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
