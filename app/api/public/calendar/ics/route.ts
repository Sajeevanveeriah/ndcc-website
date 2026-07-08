import { getPublicCalendarEvents } from '@/lib/calendar/queries';
import type { CalendarEvent } from '@/lib/calendar/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const ICS_DOMAIN = 'ndcc.com.au';

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function toIcsUtc(iso: string): string {
  const date = new Date(iso);
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function toIcsDate(iso: string): string {
  // All-day events use a date-only value in Melbourne local terms.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(iso))
    .replace(/-/g, '');
}

function foldLine(line: string): string {
  // RFC 5545: lines longer than 75 octets should be folded.
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = ' ' + rest.slice(75);
  }
  chunks.push(rest);
  return chunks.join('\r\n');
}

function eventToVevent(event: CalendarEvent): string[] {
  const lines: string[] = ['BEGIN:VEVENT'];
  lines.push(`UID:${event.id}@${ICS_DOMAIN}`);
  lines.push(`DTSTAMP:${toIcsUtc(event.updated_at || event.created_at)}`);
  if (event.all_day) {
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(event.start_at)}`);
    if (event.end_at) {
      // DTEND for all-day events is exclusive: add one day past the final day.
      const endMs = Date.parse(event.end_at) + 24 * 60 * 60 * 1000;
      lines.push(`DTEND;VALUE=DATE:${toIcsDate(new Date(endMs).toISOString())}`);
    }
  } else {
    lines.push(`DTSTART:${toIcsUtc(event.start_at)}`);
    if (event.end_at) lines.push(`DTEND:${toIcsUtc(event.end_at)}`);
  }
  let summary = event.title;
  if (event.status === 'cancelled') summary = `Cancelled: ${summary}`;
  if (event.status === 'postponed') summary = `Postponed: ${summary}`;
  lines.push(`SUMMARY:${escapeIcsText(summary)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  const location = [event.location, event.venue_address].filter(Boolean).join(', ');
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  if (event.status === 'cancelled') lines.push('STATUS:CANCELLED');
  lines.push('END:VEVENT');
  return lines;
}

export async function GET() {
  // Only published, public, calendar-visible events are exported (plus their
  // cancelled/postponed states so subscribers see changes) — never drafts or
  // committee-only entries.
  const result = await getPublicCalendarEvents({});
  if (result.degraded) {
    return new Response('Calendar is temporarily unavailable.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
    });
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Newcomb and District Cricket Club//Club Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:NDCC Club Calendar',
    'X-WR-TIMEZONE:Australia/Melbourne',
  ];
  for (const event of result.data) {
    lines.push(...eventToVevent(event));
  }
  lines.push('END:VCALENDAR');

  const body = lines.map(foldLine).join('\r\n') + '\r\n';
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ndcc-calendar.ics"',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
