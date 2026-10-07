import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitiseCommitteeCalendarIcs } from '../lib/calendar/google-committee-ics.ts';

const upstream = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'X-WR-CALNAME:NDCC Committee 2026/2027',
  'BEGIN:VEVENT',
  'UID:event-1@google.com',
  'DTSTAMP:20260831T043000Z',
  'DTSTART:20261121T030000Z',
  'DTEND:20261121T070000Z',
  'SUMMARY:Baby Shower - Tarni Muir',
  'DESCRIPTION:Fee paid\\nCommittee-only booking note',
  'LOCATION:Newcomb and District Cricket Club',
  'ORGANIZER:mailto:ndcc.secretary1@gmail.com',
  'ATTENDEE:mailto:someone@example.com',
  'URL:https://calendar.google.com/private-link',
  'X-GOOGLE-CONFERENCE:https://meet.google.com/example',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const safe = sanitiseCommitteeCalendarIcs(upstream);
assert.match(safe, /X-WR-CALNAME:NDCC Committee Calendar/);
assert.match(safe, /SUMMARY:Baby Shower - Tarni Muir/);
assert.match(safe, /LOCATION:Newcomb and District Cricket Club/);
assert.match(safe, /DTSTART:20261121T030000Z/);
assert.doesNotMatch(safe, /DESCRIPTION:/);
assert.doesNotMatch(safe, /Fee paid/);
assert.doesNotMatch(safe, /ORGANIZER:/);
assert.doesNotMatch(safe, /ATTENDEE:/);
assert.doesNotMatch(safe, /URL:/);
assert.doesNotMatch(safe, /X-GOOGLE/);
assert.ok(safe.endsWith('\r\n'));

const route = readFileSync(new URL('../app/committee-calendar.ics/route.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/committee-calendar/page.tsx', import.meta.url), 'utf8');
const control = readFileSync(new URL('../components/calendar/CommitteeCalendarSubscribe.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260831062837_committee_calendar_private_feed.sql', import.meta.url), 'utf8');

assert.match(route, /calendar_private_feeds/);
assert.match(route, /createServerClient/);
assert.match(route, /validateGooglePrivateIcsUrl/);
assert.match(route, /sanitiseCommitteeCalendarIcs/);
assert.match(route, /AbortSignal\.timeout\(8000\)/);
assert.match(route, /text\/calendar/);
assert.match(route, /X-Robots-Tag/);
assert.doesNotMatch(route, /public\/basic\.ics/);
assert.doesNotMatch(route, /calendar\.google\.com\/calendar\/ical\//);
assert.doesNotMatch(route, /\/private-[a-f0-9]{16,}\//i);

assert.match(migration, /create table if not exists public\.calendar_private_feeds/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all on table public\.calendar_private_feeds from public, anon, authenticated, service_role/i);
assert.match(migration, /grant select on table public\.calendar_private_feeds to service_role/i);
assert.doesNotMatch(migration, /calendar\.google\.com\/calendar\/ical\//);
assert.doesNotMatch(migration, /private-[a-f0-9]{16,}/i);

assert.match(page, /robots: \{ index: false, follow: false \}/);
assert.match(control, /const FEED_PATH = 'www\.ndcc\.com\.au\/committee-calendar\.ics';/);
assert.match(control, /const WEBCAL_URL = `webcal:\/\/\$\{FEED_PATH\}\$\{query\}`;/);
assert.match(control, /Copy subscription link/);
assert.match(control, /Google Calendar/);
assert.match(control, /Download current events/);
assert.doesNotMatch(control, /calendar\.google\.com\/calendar\/ical/);

console.log('Committee calendar subscription tests passed.');

// Google Maps' "171 Coppards Rd" for the club is corrected to the council-listed 141.
const mapsLocation = sanitiseCommitteeCalendarIcs(upstream.replace(
  'LOCATION:Newcomb and District Cricket Club',
  'LOCATION:Newcomb and District Cricket Club\\, 171 Coppards Rd\\, Moolap VIC 3\r\n 224\\, Australia',
));
assert.match(mapsLocation.replace(/\r\n /g, ''), /LOCATION:Newcomb and District Cricket Club\\, 141 Coppards Rd\\, Moolap VIC 3224\\, Australia/);
assert.doesNotMatch(mapsLocation.replace(/\r\n /g, ''), /171 Coppards/);
const otherVenue = sanitiseCommitteeCalendarIcs(upstream.replace(
  'LOCATION:Newcomb and District Cricket Club',
  'LOCATION:Leopold Sportsmans Club\\, 135 Kensington Rd\\, Leopold VIC 3224',
));
assert.match(otherVenue.replace(/\r\n /g, ''), /135 Kensington Rd/);
const otherAt171 = sanitiseCommitteeCalendarIcs(upstream.replace(
  'LOCATION:Newcomb and District Cricket Club',
  'LOCATION:Example Business\\, 171 Coppards Rd\\, Moolap VIC 3224',
));
assert.match(otherAt171.replace(/\r\n /g, ''), /Example Business\\, 171 Coppards Rd/, 'another venue at 171 keeps its address');
console.log('PASS: committee feed shows the club at 141 Coppards Road.');

// Privacy: without the committee key the address serves the public club
// calendar (published public events only) and never reads the Google feed.
const feedRoute = readFileSync('app/committee-calendar.ics/route.ts', 'utf8');
assert.match(feedRoute, /import \{ GET as getPublicClubCalendar \} from '@\/app\/api\/public\/calendar\/ics\/route';/);
const keyCheck = feedRoute.indexOf("if (!(await isCommitteeFeedKey(url.searchParams.get('key')))) {");
assert.ok(keyCheck > 0, 'the key is checked');
assert.ok(keyCheck < feedRoute.indexOf('getCommitteeCalendarSourceUrl()', keyCheck), 'the Google source is only read after the key check');
assert.match(feedRoute.slice(keyCheck, feedRoute.indexOf('getCommitteeCalendarSourceUrl()', keyCheck)), /return new Response\(publicFeed\.body/);
assert.match(feedRoute, /'Cache-Control': 'private, no-store'/, 'the private feed is never cached');
assert.doesNotMatch(feedRoute, /s-maxage=300/);
const keyLib = readFileSync('lib/calendar/committee-feed-key.ts', 'utf8');
assert.match(keyLib, /^import 'server-only';/);
assert.match(keyLib, /timingSafeEqual/);
assert.match(keyLib, /ndcc-committee-calendar-feed-v2:\$\{userId\}/, 'each member has their own key');
assert.match(keyLib, /data\.is_active === true && CLUB_ADMIN_ROLES\.includes\(data\.role as AuthRole\)/, 'a deactivated or demoted member loses the feed');
assert.match(keyLib, /if \(error \|\| !data\) return false;/, 'fails closed');
const calendarPage = readFileSync('app/committee-calendar/page.tsx', 'utf8');
assert.match(calendarPage, /requireSession\(CLUB_ADMIN_ROLES\)/);
assert.match(calendarPage, /const feedKey = member \? committeeFeedKey\(member\.id\) : null;/);
console.log('PASS: the open committee address serves only the public club calendar; the full feed needs the committee key.');
