'use client';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg, EventInput } from '@fullcalendar/core';

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
  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
      initialView={isMobile ? 'listMonth' : 'dayGridMonth'}
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,listMonth',
      }}
      buttonText={{ today: 'Today', month: 'Month', week: 'Week', list: 'List' }}
      events={events}
      eventClick={onEventClick}
      height="auto"
      dayMaxEventRows={3}
      firstDay={1}
      nowIndicator
      eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
      noEventsContent="No club events in this period."
    />
  );
}
