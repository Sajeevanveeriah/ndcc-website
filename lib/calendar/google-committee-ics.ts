const ALLOWED_EVENT_PROPERTIES = new Set([
  'UID',
  'DTSTAMP',
  'CREATED',
  'LAST-MODIFIED',
  'SEQUENCE',
  'DTSTART',
  'DTEND',
  'DURATION',
  'SUMMARY',
  'LOCATION',
  'STATUS',
  'TRANSP',
  'RRULE',
  'RDATE',
  'EXDATE',
  'RECURRENCE-ID',
  'CATEGORIES',
]);

function unfoldLines(value: string): string[] {
  return value
    .replace(/\r?\n[ \t]/g, '')
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
}

function propertyName(line: string): string {
  const colon = line.indexOf(':');
  if (colon < 0) return line.toUpperCase();
  const semicolon = line.indexOf(';');
  const end = semicolon >= 0 && semicolon < colon ? semicolon : colon;
  return line.slice(0, end).toUpperCase();
}

function foldLine(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;

  const chunks: string[] = [];
  let chunk = '';
  let chunkBytes = 0;

  for (const character of line) {
    const bytes = Buffer.byteLength(character, 'utf8');
    const limit = chunks.length === 0 ? 75 : 74;
    if (chunk && chunkBytes + bytes > limit) {
      chunks.push(chunk);
      chunk = character;
      chunkBytes = bytes;
      continue;
    }
    chunk += character;
    chunkBytes += bytes;
  }

  if (chunk) chunks.push(chunk);
  return chunks.join('\r\n ');
}

function collectTimezones(lines: string[]): string[][] {
  const components: string[][] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VTIMEZONE') {
      current = [line];
      continue;
    }
    if (!current) continue;
    current.push(line);
    if (line === 'END:VTIMEZONE') {
      components.push(current);
      current = null;
    }
  }

  return components;
}

// Google Maps places the club at "171 Coppards Rd", so committee events that
// pick the club from Maps carry that number. The City of Greater Geelong lists
// Grinter Reserve at 141 Coppards Road, as the rest of the site does.
// Only a location naming the club or the reserve is corrected, so another venue
// that really is at 171 Coppards Road keeps its address.
const CLUB_VENUE = /Newcomb (and|&|\\&) District Cricket Club|Grinter Reserve/i;

export function correctClubAddress(line: string): string {
  if (!CLUB_VENUE.test(line)) return line;
  return line.replace(/\b171 Coppards (Rd|Road)\b/g, '141 Coppards $1');
}

function collectSafeEvents(lines: string[]): string[][] {
  const events: string[][] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = ['BEGIN:VEVENT'];
      continue;
    }
    if (!current) continue;

    if (line === 'END:VEVENT') {
      current.push('END:VEVENT');
      const hasStart = current.some((item) => propertyName(item) === 'DTSTART');
      const hasSummary = current.some((item) => propertyName(item) === 'SUMMARY');
      if (hasStart && hasSummary) events.push(current);
      current = null;
      continue;
    }

    if (ALLOWED_EVENT_PROPERTIES.has(propertyName(line))) {
      current.push(propertyName(line) === 'LOCATION' ? correctClubAddress(line) : line);
    }
  }

  return events;
}

const MELBOURNE_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' });

/** The Melbourne calendar date (YYYY-MM-DD) an event starts on, or null when DTSTART cannot be read. */
export function eventStartDate(event: string[]): string | null {
  const line = event.find((item) => propertyName(item) === 'DTSTART');
  if (!line) return null;
  const value = line.slice(line.indexOf(':') + 1).trim();
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss, utc] = match;
  // All-day dates and local (TZID) times already name the calendar day.
  if (!hh || !utc) return `${y}-${m}-${d}`;
  return MELBOURNE_DATE.format(new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss))));
}

type SanitiseOptions = {
  /** Keep only events for which this returns true (the open feed keeps public club events). */
  keepEvent?: (event: string[]) => boolean;
};

export function sanitiseCommitteeCalendarIcs(source: string, options: SanitiseOptions = {}): string {
  const lines = unfoldLines(source);
  if (!lines.includes('BEGIN:VCALENDAR') || !lines.includes('END:VCALENDAR')) {
    throw new Error('Upstream response is not an iCalendar document.');
  }

  const timezones = collectTimezones(lines);
  const allEvents = collectSafeEvents(lines);
  if (allEvents.length === 0) {
    throw new Error('Upstream iCalendar document contains no usable events.');
  }
  // A filtered feed may legitimately be empty (no public events yet).
  const events = options.keepEvent ? allEvents.filter(options.keepEvent) : allEvents;

  const output = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Newcomb and District Cricket Club//Committee Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:NDCC Committee Calendar',
    'X-WR-TIMEZONE:Australia/Melbourne',
    ...timezones.flat(),
    ...events.flat(),
    'END:VCALENDAR',
  ];

  return `${output.map(foldLine).join('\r\n')}\r\n`;
}
