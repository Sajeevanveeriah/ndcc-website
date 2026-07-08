#!/usr/bin/env node
// Deterministic unit tests for the club calendar logic: payload validation,
// FullCalendar feed mapping, Melbourne-time formatting and colour resolution.
//
// lib/calendar/format.ts imports './types', which plain
// `node --experimental-strip-types` cannot resolve without an extension.
// Modules are copied into a temp dir with specifiers rewritten before
// importing; sources are never modified.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, '..');
const tmpDir = join(scriptsDir, '.calendar-logic-tmp');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`PASS ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}`);
  }
}

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });
for (const name of ['types.ts', 'format.ts']) {
  const source = readFileSync(join(repoRoot, 'lib', 'calendar', name), 'utf8')
    .replace(/from '\.\/types'/g, "from './types.ts'");
  writeFileSync(join(tmpDir, name), source);
}

const format = await import(pathToFileURL(join(tmpDir, 'format.ts')).href);
const { validateCalendarEventPayload, toCalendarFeedEvent, formatEventDateRange, utcToMelbourneFloating, eventColour } = format;

// --- validateCalendarEventPayload ---
check('create requires title', validateCalendarEventPayload({ start_at: '2026-12-05T08:00:00Z' }, true) !== null);
check('create requires start', validateCalendarEventPayload({ title: 'Training' }, true) !== null);
check('valid create passes', validateCalendarEventPayload({ title: 'Training', start_at: '2026-12-05T08:00:00Z' }, true) === null);
check('end before start rejected', validateCalendarEventPayload({ title: 'X', start_at: '2026-12-05T08:00:00Z', end_at: '2026-12-05T07:00:00Z' }, true) !== null);
check('end after start accepted', validateCalendarEventPayload({ title: 'X', start_at: '2026-12-05T08:00:00Z', end_at: '2026-12-05T10:00:00Z' }, true) === null);
check('bad event_type rejected', validateCalendarEventPayload({ event_type: 'party' }, false) !== null);
check('good event_type accepted', validateCalendarEventPayload({ event_type: 'social' }, false) === null);
check('bad status rejected', validateCalendarEventPayload({ status: 'live' }, false) !== null);
check('bad visibility rejected', validateCalendarEventPayload({ visibility: 'secret' }, false) !== null);
check('bad url rejected', validateCalendarEventPayload({ cta_url: 'not a url' }, false) !== null);
check('site path url accepted', validateCalendarEventPayload({ cta_url: '/events/abc' }, false) === null);
check('https url accepted', validateCalendarEventPayload({ external_url: 'https://ndcc.com.au' }, false) === null);
check('negative price rejected', validateCalendarEventPayload({ ticket_price: -5 }, false) !== null);
check('zero price accepted', validateCalendarEventPayload({ ticket_price: 0 }, false) === null);
check('fractional capacity rejected', validateCalendarEventPayload({ capacity: 2.5 }, false) !== null);
check('positive capacity accepted', validateCalendarEventPayload({ capacity: 40 }, false) === null);
check('partial update without title allowed', validateCalendarEventPayload({ location: 'Grinter Reserve' }, false) === null);

// --- feed mapping ---
const baseEvent = {
  id: 'abc-123',
  title: 'Presentation Night',
  slug: null,
  description: 'Season wrap-up',
  start_at: '2026-12-05T08:00:00Z',
  end_at: '2026-12-05T11:00:00Z',
  all_day: false,
  location: 'Clubrooms',
  venue_address: 'Grinter Reserve, Moolap',
  event_type: 'social',
  category: null,
  visibility: 'public',
  status: 'published',
  is_featured: false,
  show_on_home: true,
  show_on_contact: true,
  show_on_calendar: true,
  image_url: null,
  external_url: null,
  cta_label: 'Book now',
  cta_url: '/events/abc',
  registration_required: true,
  ticket_price: 25,
  capacity: 120,
  colour: null,
  sort_order: 0,
  recurrence_rule: null,
  recurrence_until: null,
  source: 'cms',
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
};

const feed = toCalendarFeedEvent(baseEvent);
check('feed keeps id/title/start', feed.id === 'abc-123' && feed.title === 'Presentation Night' && feed.start === baseEvent.start_at);
check('feed extendedProps carry cta and status', feed.extendedProps.ctaUrl === '/events/abc' && feed.extendedProps.status === 'published');
check('cancelled events are greyed', toCalendarFeedEvent({ ...baseEvent, status: 'cancelled' }).backgroundColor === '#9ca3af');
check('featured events get gold border', toCalendarFeedEvent({ ...baseEvent, is_featured: true }).borderColor === '#d4a017');
check('custom colour wins', eventColour({ colour: '#123456', event_type: 'social' }) === '#123456');
check('invalid colour falls back to type colour', eventColour({ colour: 'red-ish', event_type: 'training' }) === '#1e3a5f');

// --- Melbourne time handling ---
// 2026-12-05T08:00:00Z is 19:00 AEDT (summer, UTC+11).
check('utcToMelbourneFloating handles AEDT', utcToMelbourneFloating('2026-12-05T08:00:00Z') === '2026-12-05T19:00:00');
// 2026-07-08T08:00:00Z is 18:00 AEST (winter, UTC+10).
check('utcToMelbourneFloating handles AEST', utcToMelbourneFloating('2026-07-08T08:00:00Z') === '2026-07-08T18:00:00');
const range = formatEventDateRange(baseEvent);
check('range renders Melbourne times', /7:00\s?pm/i.test(range) && /10:00\s?pm/i.test(range));
const allDay = formatEventDateRange({ start_at: '2026-12-05T08:00:00Z', end_at: null, all_day: true });
check('all-day range labelled', /All day/.test(allDay));

rmSync(tmpDir, { recursive: true, force: true });

if (failures) {
  console.error(`${failures} calendar logic check(s) failed.`);
  process.exit(1);
}
console.log('All calendar logic checks passed.');
