#!/usr/bin/env node
// Transfer-window weekdays are ISO numbered (Monday=1 ... Sunday=7) in
// fantasy_dino_settings, dino_coach_transfer_window_open and
// isTransferWindowOpen. The admin select, API validation and public labels
// must use the same numbering so Sunday can be configured and the live
// values (2 = Tuesday, 6 = Saturday) keep their meaning.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ISO_WEEKDAY_OPTIONS, isIsoWeekday, isoWeekdayLabel, isTransferWindowOpen } from '../lib/dino-coach/domain.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

assert.deepEqual(ISO_WEEKDAY_OPTIONS.map((option) => option.value), [1, 2, 3, 4, 5, 6, 7]);
assert.deepEqual(ISO_WEEKDAY_OPTIONS.map((option) => option.label), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
assert.equal(isoWeekdayLabel(2), 'Tuesday', 'Live opening day 2 stays Tuesday');
assert.equal(isoWeekdayLabel(6), 'Saturday', 'Live closing day 6 stays Saturday');
assert.equal(isoWeekdayLabel(7), 'Sunday');
assert.equal(isoWeekdayLabel(0), '', 'Zero is not a weekday');
for (const value of [1, 7]) assert.equal(isIsoWeekday(value), true, `${value} is valid`);
for (const value of [0, 8, 1.5, '1', null, undefined, Number.NaN]) assert.equal(isIsoWeekday(value), false, `${String(value)} is invalid`);

// Sunday close: Tuesday 00:00 to Sunday 18:00 Melbourne (AEST in September 2026).
const sundayClose = { timezone: 'Australia/Melbourne', openWeekday: 2, openMinute: 0, closeWeekday: 7, closeMinute: 1080 };
assert.equal(isTransferWindowOpen(new Date('2026-09-27T07:59:00Z'), sundayClose), true, 'Sunday 17:59 before a Sunday close is open');
assert.equal(isTransferWindowOpen(new Date('2026-09-27T08:00:00Z'), sundayClose), false, 'Sunday 18:00 closes');
assert.equal(isTransferWindowOpen(new Date('2026-09-26T05:00:00Z'), sundayClose), true, 'Saturday is inside a Tuesday-to-Sunday window');
assert.equal(isTransferWindowOpen(new Date('2026-09-28T05:00:00Z'), sundayClose), false, 'Monday is outside');
// Sunday open: Sunday 09:00 to Sunday 23:59 only.
const sundayOnly = { timezone: 'Australia/Melbourne', openWeekday: 7, openMinute: 540, closeWeekday: 7, closeMinute: 1439 };
assert.equal(isTransferWindowOpen(new Date('2026-09-27T00:00:00Z'), sundayOnly), true, 'Sunday 10:00 open');
assert.equal(isTransferWindowOpen(new Date('2026-09-26T00:00:00Z'), sundayOnly), false, 'Saturday closed');

const page = read('app/admin/fantasy/settings/page.tsx');
assert.ok(page.includes('ISO_WEEKDAY_OPTIONS.map'), 'Admin day select uses ISO values');
assert.ok(!page.includes("['Sunday','Monday'"), 'Admin day select no longer uses Sunday=0 indexes');
const route = read('app/api/admin/fantasy/settings/route.ts');
assert.ok(route.includes('.every(isIsoWeekday)'), 'Settings API validates ISO weekdays 1 to 7');
assert.ok(!/v <= 6\)/.test(route), 'Settings API no longer caps weekdays at 6');
const transfers = read('app/fantasy/_components/TransfersClient.tsx');
assert.ok(transfers.includes('isoWeekdayLabel(data.settings.transfer_open_weekday)') && transfers.includes('isoWeekdayLabel(data.settings.transfer_close_weekday)'));

console.log('PASS Dino transfer weekdays: ISO options, validation, Sunday windows, live values unchanged');
