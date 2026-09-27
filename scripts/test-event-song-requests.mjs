// Song-request events (iPod Shuffle): input rules and the wiring that makes
// songs the paid entry. Database behaviour is covered by migration replay.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EVENT_SONG_LIMITS, isSongRequestEvent, normaliseSongRequests, songLabel } from '../lib/events/song-requests.ts';

const ok = (input) => {
  const result = normaliseSongRequests(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
};
const fails = (input, pattern) => {
  const result = normaliseSongRequests(input);
  assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(input)}`);
  assert.match(result.error, pattern);
};

fails(undefined, /at least one song/);
fails([], /at least one song/);
fails('Song', /at least one song/);
fails([{ title: '   ' }], /title for song 1/);
fails([{ title: 'A' }, null], /Song 2 is invalid/);
fails([{ title: 5 }], /Song 1 is invalid/);
fails([{ title: 'A', artist: 7 }], /Song 1 is invalid/);
fails([{ title: 'x'.repeat(EVENT_SONG_LIMITS.titleLength + 1) }], /title must be/);
fails([{ title: 'A', artist: 'y'.repeat(EVENT_SONG_LIMITS.artistLength + 1) }], /artist must be/);
fails(Array.from({ length: EVENT_SONG_LIMITS.maxSongs + 1 }, () => ({ title: 'A' })), /Place another order/);

assert.deepEqual(ok([{ title: '  Mr   Brightside ', artist: ' The Killers ' }]), [{ title: 'Mr Brightside', artist: 'The Killers' }]);
assert.deepEqual(ok([{ title: 'Thunderstruck' }]), [{ title: 'Thunderstruck', artist: '' }]);
assert.deepEqual(ok([{ title: 'Line\nbreak', artist: null }]), [{ title: 'Line break', artist: '' }]);
assert.equal(ok(Array.from({ length: EVENT_SONG_LIMITS.maxSongs }, (_, i) => ({ title: `Song ${i}` }))).length, EVENT_SONG_LIMITS.maxSongs);
assert.equal(songLabel({ title: 'Thunderstruck', artist: 'AC/DC' }), 'Thunderstruck - AC/DC');
assert.equal(songLabel({ title: 'Thunderstruck', artist: '' }), 'Thunderstruck');
assert.equal(isSongRequestEvent({ registration_mode: 'song_requests' }), true);
assert.equal(isSongRequestEvent({ registration_mode: 'tickets' }), false);
assert.equal(isSongRequestEvent({}), false);
assert.equal(isSongRequestEvent(null), false);

const route = readFileSync(new URL('../app/api/events/route.ts', import.meta.url), 'utf8');
assert.match(route, /songEvent !== hasSongs/, 'song events require songs and ticket events refuse them');
assert.match(route, /const totalCents = ticketPriceCents \* unitCount/, 'song entries are charged per song');
assert.match(route, /name: eventRow\.title,\s*size: `Song: \$\{songLabel\(song\)\}`/, 'each song is its own order line under the event purchase group');
assert.match(route, /ndcc_register_event_song_entry/, 'songs are stored atomically with the entry');
assert.match(route, /!songEvent && isMissingRegistrationRpc/, 'song entries never fall back to a plain insert without songs');

const migration = readFileSync(new URL('../supabase/migrations/20260927140000_event_song_requests.sql', import.meta.url), 'utf8');
assert.match(migration, /registration_mode in \('tickets', 'song_requests'\)/);
assert.match(migration, /jsonb_array_length\(song_requests\) between 1 and 30/);
assert.match(migration, /revoke all on function public\.ndcc_register_event_song_entry[^;]+from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.ndcc_register_event_song_entry[^;]+to service_role/);
assert.match(migration, /ndcc_register_event_attendee\(\s*p_event_id, p_name, p_email, p_phone, 1,/, 'reuses the locked attendee function for one entrant');

const publicData = readFileSync(new URL('../lib/public-data.ts', import.meta.url), 'utf8');
assert.match(publicData, /\/registration_mode\/\.test\(error\?\.message \|\| ''\)\) \(\{ data, error \} = await query\(true, false\)\)/, 'events still list if the registration_mode column is missing');
const adminEvents = readFileSync(new URL('../app/admin/events/page.tsx', import.meta.url), 'utf8');
assert.match(adminEvents, /\|\| registrations\.some\(\(registration\) => registration\.event_id === event\.id && \(registration\.song_requests\?\.length \?\? 0\) > 0\)/, 'pots stay visible after a mode change');
assert.match(adminEvents, /sum \+ Number\(order\?\.total_amount \|\| 0\)/, 'the song pot uses paid order totals, not the current price');
assert.match(adminEvents, /registration\.order_id && \(registration\.song_requests\?\.length \?\? 0\) > 0/, 'ticket registrations never enter the song pot');
assert.match(adminEvents, /form\.registration_mode === 'song_requests' \|\| editingHasMode/, 'ticket saves omit registration_mode unless the row has it');
assert.match(adminEvents, /registration\.order_id && \(registration\.song_requests\?\.length \?\? 0\) > 0 \? \(\s*<Link href="\/admin\/orders"/, 'song entry payments go through the order ledger, not the registration toggle');

console.log('PASS event song requests: validation, limits, labels, per-song pricing, atomic storage and privileges');
