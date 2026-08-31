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

    if (ALLOWED_EVENT_PROPERTIES.has(propertyName(line))) current.push(line);
  }

  return events;
}

export function sanitiseCommitteeCalendarIcs(source: string): string {
  const lines = unfoldLines(source);
  if (!lines.includes('BEGIN:VCALENDAR') || !lines.includes('END:VCALENDAR')) {
    throw new Error('Upstream response is not an iCalendar document.');
  }

  const timezones = collectTimezones(lines);
  const events = collectSafeEvents(lines);
  if (events.length === 0) {
    throw new Error('Upstream iCalendar document contains no usable events.');
  }

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
