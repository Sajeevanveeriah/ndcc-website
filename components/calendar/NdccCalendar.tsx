'use client';

import { useEffect, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg } from '@fullcalendar/core';
import type { CalendarFeedEvent } from '@/lib/calendar/types';
import { utcToMelbourneFloating } from '@/lib/calendar/format';
import CalendarFilters from './CalendarFilters';
import CalendarLegend from './CalendarLegend';
import EventDetailModal from './EventDetailModal';
import './calendar-theme.css';

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

      <div className="ndcc-calendar bg-white rounded-xl border border-gray-100 shadow-card p-3 sm:p-5">
        {!mounted ? (
          <div className="animate-pulse py-24 text-center text-sm text-gray-400 font-body" role="status">
            Loading calendar…
          </div>
        ) : (
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView={isMobile ? 'listMonth' : 'dayGridMonth'}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,listMonth',
            }}
            buttonText={{ today: 'Today', month: 'Month', week: 'Week', list: 'List' }}
            events={calendarEvents}
            eventClick={handleEventClick}
            height="auto"
            dayMaxEventRows={3}
            firstDay={1}
            nowIndicator
            eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
            noEventsContent="No club events in this period."
          />
        )}
      </div>

      <p className="mt-2 text-xs text-gray-500 font-body">All times shown in Melbourne time (AEST/AEDT).</p>

      {showLegend && <CalendarLegend className="mt-4" />}

      <EventDetailModal event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
