#!/usr/bin/env node
// Snail racing: entry rules, bulk entry, race card allocation, committee
// exports (synthetic data only) and the wiring that keeps sales unlimited.
// Database behaviour is covered by migration replay; the purchase API by
// scripts/test-public-event-flows.mjs.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(repoRoot, file), 'utf8');
const stage = mkdtempSync(path.join(tmpdir(), 'ndcc-snail-'));
writeFileSync(path.join(stage, 'snail-race.ts'), read('lib/events/snail-race.ts'));
writeFileSync(path.join(stage, 'csv.ts'), read('lib/csv.ts'));
writeFileSync(path.join(stage, 'method-choice.ts'), read('lib/payments/method-choice.ts'));
writeFileSync(path.join(stage, 'snail-race-export.ts'), read('lib/events/snail-race-export.ts')
  .replace("'@/lib/csv'", "'./csv.ts'")
  .replace("'@/lib/payments/method-choice'", "'./method-choice.ts'")
  .replace("'./snail-race'", "'./snail-race.ts'"));

const {
  SNAIL_RACE_LIMITS, isSnailRaceEvent, normaliseSnailEntries, normaliseSponsorships, normaliseSponsorName, sponsoredRaceName, parseBulkSnailLines, allocateRaces, snailRaceSetting,
} = await import(pathToFileURL(path.join(stage, 'snail-race.ts')).href);
const { snailExportRows, snailCsv, snailRaceCard, sponsorshipTotals, sponsorExportRows, sponsorCsv, SNAIL_CSV_HEADER, SPONSOR_CSV_HEADER } = await import(pathToFileURL(path.join(stage, 'snail-race-export.ts')).href);

// Entry rules.
const ok = (input, buyer = 'Jane Buyer') => {
  const result = normaliseSnailEntries(input, buyer);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
};
const fails = (input, pattern) => {
  const result = normaliseSnailEntries(input, 'Jane Buyer');
  assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(input).slice(0, 80)}`);
  assert.match(result.error, pattern);
};
fails('Turbo', /invalid/);
fails([null], /Snail 1 is invalid/);
fails([{ snail_name: 5 }], /Snail 1 is invalid/);
fails([{ snail_name: 'A', player_name: 7 }], /Snail 1 is invalid/);
fails([{ snail_name: '  ' }], /name for snail 1/);
fails([{ snail_name: 'x'.repeat(SNAIL_RACE_LIMITS.snailNameLength + 1) }], /24 characters or fewer/);
fails([{ snail_name: 'A', player_name: 'y'.repeat(SNAIL_RACE_LIMITS.playerNameLength + 1) }], /player name must be 40/);
fails(Array.from({ length: SNAIL_RACE_LIMITS.maxSnailsPerOrder + 1 }, () => ({ snail_name: 'A' })), /Place another order/);
assert.deepEqual(ok([]), [], 'an order may be sponsorship only');
assert.deepEqual(ok([{ snail_name: '  Turbo\n Snail ', player_name: '  ' }, { snail_name: 'Gary', player_name: ' The  Kids ' }]), [
  { snail_name: 'Turbo Snail', player_name: 'Jane Buyer' },
  { snail_name: 'Gary', player_name: 'The Kids' },
]);
assert.equal(ok(Array.from({ length: 200 }, (_, i) => ({ snail_name: `S${i}` }))).length, 200);
const noBuyer = normaliseSnailEntries([{ snail_name: 'Turbo' }], '   ');
assert.equal(noBuyer.ok, false, 'a blank player name needs a buyer name to fall back on');
assert.equal(SNAIL_RACE_LIMITS.snailNameLength, 24, 'matches the SnailRace game runner name limit');

assert.deepEqual(normaliseSponsorships(undefined), { ok: true, value: 0 });
assert.deepEqual(normaliseSponsorships(3), { ok: true, value: 3 });
for (const bad of [-1, 1.5, '2', SNAIL_RACE_LIMITS.maxSponsorshipsPerOrder + 1]) assert.equal(normaliseSponsorships(bad).ok, false, String(bad));

assert.equal(isSnailRaceEvent({ registration_mode: 'snail_race' }), true);
assert.equal(isSnailRaceEvent({ registration_mode: 'song_requests' }), false);
assert.equal(isSnailRaceEvent(null), false);
assert.equal(snailRaceSetting(8, 100), 8);
assert.equal(snailRaceSetting('8', 100), 8);
for (const bad of [null, undefined, 0, -1, 2.5, 101, '', 'eight']) assert.equal(snailRaceSetting(bad, 100), null, String(bad));
console.log('PASS snail entry rules: names tidied, blank player names take the buyer name, per-order and length limits');

// Bulk entry.
assert.deepEqual(parseBulkSnailLines('Turbo\n\n  Gary  The   Snail \nSlow, but sure\r\n   \nBolt'), ['Turbo', 'Gary The Snail', 'Slow, but sure', 'Bolt']);
console.log('PASS bulk entry reads one snail name per line');

// Race sponsorship: each sponsored race is named after its sponsor.
assert.equal(sponsoredRaceName('Jack Elliott'), 'The Jack Elliott Stakes');
assert.equal(sponsoredRaceName('  the  Jack Elliott  stakes '), 'The Jack Elliott Stakes', 'no doubled "The" or "Stakes"');
assert.equal(sponsoredRaceName('   '), '');
assert.deepEqual(normaliseSponsorName(undefined, 0), { ok: true, value: null });
assert.deepEqual(normaliseSponsorName('Ignored', 0), { ok: true, value: null }, 'no sponsorship, no sponsor name');
assert.deepEqual(normaliseSponsorName('  Jack   Elliott ', 2), { ok: true, value: 'Jack Elliott' });
assert.equal(normaliseSponsorName('', 1).ok, false);
assert.equal(normaliseSponsorName(7, 1).ok, false);
assert.equal(normaliseSponsorName('x'.repeat(SNAIL_RACE_LIMITS.sponsorNameLength + 1), 1).ok, false);
console.log('PASS race sponsorship names: required when sponsoring, races called "The <sponsor> Stakes"');

// Race card allocation: unlimited sales, races filled to the per-race limit, even fields.
const numbers = (count) => Array.from({ length: count }, (_, i) => i + 1);
assert.deepEqual(allocateRaces([], 8, 8), []);
assert.deepEqual(allocateRaces(numbers(64), 8, 8).map((race) => race.length), Array(8).fill(8), 'last season: 64 snails, 8 races of 8');
assert.deepEqual(allocateRaces(numbers(40), 8, 8).map((race) => race.length), Array(5).fill(8), 'fewer sales fill fewer races');
assert.deepEqual(allocateRaces(numbers(41), 8, 8).map((race) => race.length), [7, 7, 7, 7, 7, 6], 'fields stay even');
const over = allocateRaces(numbers(100), 8, 8);
assert.equal(over.length, 13, '100 snails at 8 per race need 13 races');
assert.ok(over.every((race) => race.length <= 8 && race.length >= 7));
assert.deepEqual(over.flat().sort((a, b) => a - b), numbers(100), 'every snail is raced exactly once');
assert.deepEqual(allocateRaces(numbers(6), 8, 8), [numbers(6)], 'six snails make one race, never six one-snail races');
assert.deepEqual(allocateRaces(numbers(9), null, null), [numbers(9)], 'no settings: one field');
assert.deepEqual(allocateRaces(numbers(9), null, 8).map((race) => race.length), [3, 2, 2, 2], 'planned races alone keep two or more per race');
assert.deepEqual(allocateRaces(numbers(10), 5, 8), [[1, 3, 5, 7, 9], [2, 4, 6, 8, 10]], 'snails are dealt across races in purchase order');
console.log('PASS race card allocation: races filled to the per-race limit, added for extra sales, no one-snail races');

// Exports with 1,000 synthetic snails.
const event = { id: 'e1', title: 'Snail Racing', date: '2036-10-24T08:30:00Z', ticket_price: 10, snail_race_count: 8, snails_per_race: 8, race_sponsorship_price: 50 };
const registrations = [];
const orders = [];
for (let i = 0; i < 100; i++) {
  const orderId = `o${i}`;
  registrations.push({
    id: `r${i}`, event_id: 'e1', name: i === 0 ? '=HYPERLINK("x")' : `Buyer ${i}`, email: `b${i}@example.com`, phone: '0412345678',
    payment_status: 'pending_bank_transfer', payment_reference: `NDCCEVT-2026-${String(i).padStart(6, '0')}`, order_id: orderId,
    created_at: new Date(Date.UTC(2036, 0, 1, 0, i)).toISOString(), race_sponsorships: i % 10 === 0 ? 1 : 0,
    snail_entries: Array.from({ length: 10 }, (_, s) => ({ snail_name: `Snail ${i}-${s}`, player_name: `Player ${i}` })),
  });
  const paid = i % 2 === 0;
  orders.push({
    id: orderId, payment_status: paid ? 'paid' : 'pending_bank_transfer', total_amount: 100 + (i % 10 === 0 ? 50 : 0),
    amount_paid: paid ? 100 : 0, balance_due: paid ? 0 : 100,
    payment_method_choice: ['stripe', 'bank_transfer', 'pay_at_club', null][i % 4],
  });
}
// Released and other-event rows stay out.
registrations.push({ id: 'cancelled', event_id: 'e1', name: 'Gone', email: 'g@example.com', payment_status: 'cancelled', order_id: 'oc', created_at: '2036-01-02T00:00:00Z', snail_entries: [{ snail_name: 'Ghost', player_name: 'Gone' }] });
orders.push({ id: 'oc', payment_status: 'cancelled', total_amount: 10 });
registrations.push({ id: 'deleted', event_id: 'e1', name: 'Deleted', email: 'd@example.com', payment_status: 'pending_bank_transfer', order_id: 'od', created_at: '2036-01-02T00:00:00Z', snail_entries: [{ snail_name: 'Deleted', player_name: 'D' }] });
orders.push({ id: 'od', payment_status: 'pending_bank_transfer', total_amount: 10, deleted_at: '2036-01-03T00:00:00Z' });
registrations.push({ id: 'other', event_id: 'e2', name: 'Other', email: 'o@example.com', payment_status: 'paid', created_at: '2036-01-01T00:00:00Z', snail_entries: [{ snail_name: 'Elsewhere', player_name: 'O' }] });
registrations.push({ id: 'ticket', event_id: 'e1', name: 'Ticket', email: 't@example.com', payment_status: 'paid', created_at: '2036-01-01T00:00:00Z', quantity: 2 });

const rows = snailExportRows(event, [...registrations].reverse(), orders);
assert.equal(rows.length, 1000);
assert.deepEqual(rows.map((row) => row.snail_number), numbers(1000));
assert.equal(rows[0].snail_name, 'Snail 0-0', 'purchase order, regardless of input order');
assert.equal(rows[0].payment_method, 'Stripe checkout (card online)');
assert.equal(rows[10].payment_method, 'Bank transfer');
assert.equal(rows[20].payment_method, 'Pay at the club');
assert.equal(rows[30].payment_method, 'Not stated');
assert.equal(rows.filter((row) => row.paid).length, 500);
assert.equal(rows[0].balance_due, '0.00');
assert.equal(rows[10].balance_due, '100.00');
assert.equal(rows[0].order_total, '150.00');
assert.ok(!rows.some((row) => ['Ghost', 'Deleted', 'Elsewhere'].includes(row.snail_name)));

const csv = snailCsv(rows);
const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
assert.equal(lines.length, 1001);
assert.equal(lines[0], SNAIL_CSV_HEADER.join(','));
assert.ok(!SNAIL_CSV_HEADER.includes('player_name'), 'buyers only name snails; no player name column');
for (const column of ['snail_name', 'purchaser_name', 'purchaser_email', 'purchaser_phone', 'payment_reference', 'payment_method', 'payment_status', 'balance_due']) {
  assert.ok(SNAIL_CSV_HEADER.includes(column), column);
}
assert.match(lines[1], /^1,Snail 0-0,"'=HYPERLINK\(""x""\)",b0@example\.com,0412345678,NDCCEVT-2026-000000,Stripe checkout \(card online\),paid,yes,150\.00,100\.00,0\.00,1,/);

const card = snailRaceCard(event, rows);
assert.equal(card.format, 'ndcc-snail-race-card');
assert.equal(card.totals.snails, 1000);
assert.equal(card.races.length, 125, '1,000 snails at 8 per race');
assert.ok(card.races.every((race) => race.names.length === 8 && race.runners.length === 8));
assert.ok(card.races.flatMap((race) => race.names).every((name) => name.length <= 24));
assert.equal(new Set(card.races.flatMap((race) => race.runners.map((runner) => runner.snail_number))).size, 1000);
const paidCard = snailRaceCard(event, rows, { paidOnly: true });
assert.equal(paidCard.totals.snails, 500);
assert.equal(paidCard.totals.unpaid_snails, 0);
assert.ok(paidCard.races.every((race) => race.runners.every((runner) => runner.paid)));
assert.deepEqual(sponsorshipTotals(event, registrations, orders), { orders: 10, races: 10, paidRaces: 10 });
// Sponsors: named sponsor, fallback to the buyer for older orders, race names on the card.
registrations[0].race_sponsor_name = 'Jack Elliott';
registrations[10].race_sponsorships = 2;
const sponsors = sponsorExportRows(event, registrations, orders);
assert.equal(sponsors.length, 10);
assert.deepEqual([sponsors[0].sponsor_name, sponsors[0].race_name, sponsors[0].races], ['Jack Elliott', 'The Jack Elliott Stakes', 1]);
assert.deepEqual([sponsors[1].sponsor_name, sponsors[1].race_name, sponsors[1].races], ['Buyer 10', 'The Buyer 10 Stakes', 2]);
const sponsorLines = sponsorCsv(sponsors).replace(/^\uFEFF/, '').trim().split('\r\n');
assert.equal(sponsorLines[0], SPONSOR_CSV_HEADER.join(','));
assert.match(sponsorLines[1], /^Jack Elliott,The Jack Elliott Stakes,1,/);
const namedCard = snailRaceCard(event, rows, { sponsors });
assert.equal(namedCard.races[0].race_name, 'The Jack Elliott Stakes');
assert.equal(namedCard.races[1].race_name, 'The Buyer 10 Stakes');
assert.equal(namedCard.races[2].race_name, 'The Buyer 10 Stakes', 'two sponsorships name two races');
assert.equal(namedCard.races[10].race_name, 'The Buyer 90 Stakes');
assert.equal(namedCard.races[11].race_name, 'Race 12', 'unsponsored races keep a number');
assert.equal(namedCard.totals.sponsored_races, 11);
assert.ok(namedCard.races.every((race) => race.runners.every((runner) => !('player_name' in runner))));
console.log('PASS 1,000-snail exports: CSV with names, buyer, method, status, reference and balance; race card for the game; released orders left out');

// Wiring: unlimited sales, atomic storage, admin exports.
const migration = read('supabase/migrations/20261005095114_event_snail_racing.sql');
assert.match(migration, /registration_mode in \('tickets', 'song_requests', 'snail_race'\)/);
assert.match(migration, /jsonb_array_length\(snail_entries\) between 1 and 200/);
assert.match(migration, /snail_race_count between 1 and 100/);
assert.match(migration, /snails_per_race between 1 and 20/);
assert.match(migration, /char_length\(v_snail_name\) > 24/);
assert.match(migration, /registration_mode = 'snail_race' then\s+raise exception 'Event registration unavailable: snail racing event'/, 'ticket and song entries never land on a snail event');
const snailFunction = migration.slice(migration.indexOf('function public.ndcc_register_event_snail_entry'));
assert.ok(!/capacity/.test(snailFunction.slice(0, snailFunction.indexOf('$$;'))), 'snail entries never check capacity');
assert.match(snailFunction, /for update/, 'snail entries take the event-row lock');
assert.match(migration, /revoke all on function public\.ndcc_register_event_snail_entry[^;]+from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.ndcc_register_event_snail_entry[^;]+to service_role/);

const route = read('app/api/events/route.ts');
assert.match(route, /if \(!snailEvent && capacity !== null && capacity !== undefined\)/, 'capacity never applies to snail events');
assert.match(route, /ndcc_register_event_snail_entry/);
assert.match(route, /!songEvent && !snailEvent && isMissingRegistrationRpc/, 'snails never fall back to a plain insert without names');

const admin = read('app/admin/events/page.tsx');
assert.match(admin, /snailCsv\(rows\)/);
assert.match(admin, /snailRaceCard\(event, rows, \{ paidOnly: true, sponsors: sponsorRows \}\)/);
assert.match(admin, /sponsorCsv\(sponsorRows\)/);
assert.doesNotMatch(admin, /player: /, 'no player names in the admin list');
assert.match(admin, /Snail capacity: Unlimited/);
const resources = read('app/api/admin/resources/[resource]/route.ts');
assert.match(resources, /'snail_race_count', 'snails_per_race', 'race_sponsorship_price'/);
const validation = read('lib/admin-resource-validation.ts');
assert.match(validation, /\['tickets', 'song_requests', 'snail_race'\]/);

const detail = read('app/events/[id]/EventDetailClient.tsx');
assert.match(detail, /!snailEvent && event\.capacity/, 'no capacity shown for snail events');
assert.match(detail, /<SnailPurchaseForm event=\{event\} \/>/);
const guide = read('components/events/SnailRaceDetails.tsx');
assert.match(guide, /How the night works/);
assert.match(guide, /There is no limit on how many you buy/);
assert.match(guide, /Name your snail and be creative\. Offensive or inappropriate names will not be accepted\./);
assert.match(guide, /Each sponsored race is named after its sponsor,\s+for example The Jack Elliott Stakes\./);
assert.match(guide, /Bets for each race are taken on the night in the lead-up to that race\. They are placed in person at the club, not online,\s+so bring your betting money!/);
assert.doesNotMatch(guide, /player name/i, 'no player names on the event page');
const form = read('components/events/SnailPurchaseForm.tsx');
assert.doesNotMatch(form, /player/i, 'the purchase form only asks for snail names');
assert.match(form, /1\. Your snails/);
assert.match(form, /race_sponsor_name: sponsorName\.trim\(\)/);
assert.ok(!/\b64\b|\$4\b|17th January/.test(guide), 'no last-season figures are hard-coded');
console.log('PASS snail racing wiring: unlimited sales, locked atomic storage, admin settings and exports, event page explanation');
