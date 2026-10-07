'use client';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg, EventInput } from '@fullcalendar/core';
import { useRef } from 'react';
import { labelToolbarIcons } from './label-toolbar-icons';

type FullCalendarViewProps = {
  events: EventInput[];
  isMobile: boolean;
  onEventClick: (arg: EventClickArg) => void;
};

/**
 * The FullCalendar grid and its plugins. Loaded on demand by NdccCalendar
 * (next/dynamic, client only) so the large calendar bundle stays out of the
 * initial page JavaScript.
 */
export default function FullCalendarView({ events, isMobile, onEventClick }: FullCalendarViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={rootRef}>
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
      initialView={isMobile ? 'listMonth' : 'dayGridMonth'}
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,listMonth',
      }}
      buttonText={{ today: 'Today', month: 'Month', week: 'Week', list: 'List' }}
      // Accessible names for the icon-only prev/next buttons ($0 is the
      // current navigation unit, e.g. "Previous month").
      buttonHints={{ prev: 'Previous $0', next: 'Next $0' }}
      datesSet={() => labelToolbarIcons(rootRef.current)}
      events={events}
      eventClick={onEventClick}
      height="auto"
      dayMaxEventRows={3}
      firstDay={1}
      nowIndicator
      eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
      noEventsContent="No club events in this period."
    />
    </div>
  );
}
