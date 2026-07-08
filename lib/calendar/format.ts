import {
  CALENDAR_EVENT_TYPES,
  CALENDAR_EVENT_TYPE_COLOURS,
  CALENDAR_STATUSES,
  CALENDAR_VISIBILITIES,
  type CalendarEvent,
  type CalendarEventType,
  type CalendarFeedEvent,
} from './types';

const CLUB_TIMEZONE = 'Australia/Melbourne';

export function eventColour(event: Pick<CalendarEvent, 'colour' | 'event_type'>): string {
  const custom = typeof event.colour === 'string' ? event.colour.trim() : '';
  if (/^#[0-9a-fA-F]{3,8}$/.test(custom)) return custom;
  return CALENDAR_EVENT_TYPE_COLOURS[event.event_type] ?? CALENDAR_EVENT_TYPE_COLOURS.other;
}

export function toCalendarFeedEvent(event: CalendarEvent): CalendarFeedEvent {
  const colour = eventColour(event);
  const muted = event.status === 'cancelled' || event.status === 'postponed';
  return {
    id: event.id,
    title: event.title,
    start: event.start_at,
    end: event.end_at,
    allDay: event.all_day,
    url: event.external_url || null,
    backgroundColor: muted ? '#9ca3af' : colour,
    borderColor: event.is_featured && !muted ? '#d4a017' : muted ? '#9ca3af' : colour,
    textColor: '#ffffff',
    extendedProps: {
      description: event.description,
      location: event.location,
      venueAddress: event.venue_address,
      eventType: event.event_type,
      category: event.category,
      status: event.status,
      isFeatured: event.is_featured,
      imageUrl: event.image_url,
      ctaLabel: event.cta_label,
      ctaUrl: event.cta_url,
      registrationRequired: event.registration_required,
      ticketPrice: event.ticket_price,
      capacity: event.capacity,
      source: event.source,
    },
  };
}

function melbourneParts(iso: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-AU', { timeZone: CLUB_TIMEZONE, ...options }).format(date);
}

function melbourneDayKey(iso: string): string {
  return melbourneParts(iso, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/**
 * Human-friendly Melbourne-time range for cards/modals, e.g.
 * "Sat 14 Feb 2027, 6:00 pm – 9:00 pm" or "Sat 14 – Sun 15 Feb 2027" (all day).
 */
export function formatEventDateRange(event: Pick<CalendarEvent, 'start_at' | 'end_at' | 'all_day'>): string {
  const dayFormat: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
  const timeFormat: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
  const startDay = melbourneParts(event.start_at, dayFormat);
  if (!startDay) return '';

  const sameDay = !event.end_at || melbourneDayKey(event.start_at) === melbourneDayKey(event.end_at);

  if (event.all_day) {
    if (sameDay) return `${startDay} · All day`;
    return `${startDay} – ${melbourneParts(event.end_at as string, dayFormat)} · All day`;
  }

  const startTime = melbourneParts(event.start_at, timeFormat);
  if (!event.end_at) return `${startDay}, ${startTime}`;
  const endTime = melbourneParts(event.end_at, timeFormat);
  if (sameDay) return `${startDay}, ${startTime} – ${endTime}`;
  return `${startDay}, ${startTime} – ${melbourneParts(event.end_at, dayFormat)}, ${endTime}`;
}

/**
 * Convert a UTC ISO timestamp to a floating (offset-less) Melbourne wall-clock
 * string, e.g. "2026-12-05T18:30:00". FullCalendar renders floating strings
 * verbatim, so every visitor sees club time regardless of their own timezone.
 */
export function utcToMelbourneFloating(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00';
  // en-CA with hour12:false can emit "24" for midnight; normalise to "00".
  const hour = lookup('hour') === '24' ? '00' : lookup('hour');
  return `${lookup('year')}-${lookup('month')}-${lookup('day')}T${hour}:${lookup('minute')}:${lookup('second')}`;
}

function isValidHttpUrlOrPath(value: string): boolean {
  if (value.startsWith('/')) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Server-side validation for calendar event create/update payloads.
 * Returns an error message, or null when the payload is acceptable.
 * On update only the provided fields are checked.
 */
export function validateCalendarEventPayload(
  payload: Record<string, unknown>,
  isCreate: boolean
): string | null {
  if (isCreate || 'title' in payload) {
    if (typeof payload.title !== 'string' || !payload.title.trim()) return 'Title is required.';
  }
  if (isCreate || 'start_at' in payload) {
    if (typeof payload.start_at !== 'string' || Number.isNaN(Date.parse(payload.start_at))) {
      return 'A valid start date and time is required.';
    }
  }
  if ('end_at' in payload && payload.end_at !== null && payload.end_at !== '') {
    if (typeof payload.end_at !== 'string' || Number.isNaN(Date.parse(payload.end_at))) {
      return 'End date/time is invalid.';
    }
    if (typeof payload.start_at === 'string' && Date.parse(payload.end_at) < Date.parse(payload.start_at)) {
      return 'End must be after the start.';
    }
  }
  if ('event_type' in payload && !CALENDAR_EVENT_TYPES.includes(payload.event_type as CalendarEventType)) {
    return 'Event type is not recognised.';
  }
  if ('visibility' in payload && !CALENDAR_VISIBILITIES.includes(payload.visibility as never)) {
    return 'Visibility is not recognised.';
  }
  if ('status' in payload && !CALENDAR_STATUSES.includes(payload.status as never)) {
    return 'Status is not recognised.';
  }
  for (const field of ['external_url', 'cta_url', 'image_url'] as const) {
    const value = payload[field];
    if (value !== undefined && value !== null && value !== '' ) {
      if (typeof value !== 'string' || !isValidHttpUrlOrPath(value)) {
        return `${field.replace('_', ' ')} must be a valid URL or site path.`;
      }
    }
  }
  if ('ticket_price' in payload && payload.ticket_price !== null && payload.ticket_price !== undefined) {
    const price = Number(payload.ticket_price);
    if (!Number.isFinite(price) || price < 0) return 'Ticket price must be zero or more.';
  }
  if ('capacity' in payload && payload.capacity !== null && payload.capacity !== undefined) {
    const capacity = Number(payload.capacity);
    if (!Number.isInteger(capacity) || capacity <= 0) return 'Capacity must be a positive whole number.';
  }
  return null;
}
