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
assert.match(control, /webcal:\/\/www\.ndcc\.com\.au\/committee-calendar\.ics/);
assert.match(control, /Copy subscription link/);
assert.match(control, /Google Calendar/);
assert.match(control, /Download current events/);
assert.doesNotMatch(control, /calendar\.google\.com\/calendar\/ical/);

console.log('Committee calendar subscription tests passed.');
