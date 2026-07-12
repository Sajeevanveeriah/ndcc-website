import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const nav = readFileSync('components/layout/Navbar.tsx', 'utf8');
for (const group of ['Cricket','Club','Get Involved','Community','Shop']) assert.match(nav, new RegExp(`label: '${group}'`));
for (const route of ['/teams','/fixtures','/fantasy','/join','/volunteer','/events','/news','/gallery','/sponsors','/merchandise','/kitchen','/contact']) assert.ok(nav.includes(route), `${route} preserved`);
assert.match(nav, /Mobile grouped admin navigation|section key=\{group.label\}/);

// The homepage marquee must render the complete active CMS collection: the old
// four-item cap (`appointments.slice(0, 4)`) and any equivalent truncation are
// regressions.
const appointments = readFileSync('components/home/SeasonAppointmentsMarquee.tsx', 'utf8');
const marqueePlan = readFileSync('lib/season-appointments-marquee.ts', 'utf8');
assert.ok(!appointments.includes('slice(0, 4)'), 'four-item cap removed from the marquee component');
for (const [label, source] of [['component', appointments], ['marquee plan', marqueePlan]]) {
  assert.ok(!/\.slice\(/.test(source), `${label} must not truncate the appointments array`);
  assert.ok(!/\.splice\(/.test(source), `${label} must not truncate the appointments array in place`);
  assert.ok(!/\bfilter\(/.test(source), `${label} must not drop appointments client-side`);
}
assert.match(marqueePlan, /appointments\.map\(/); // whole array mapped through normalisation
assert.match(appointments, /planSeasonAppointmentsMarquee\(appointments\)/);
assert.match(appointments, /marquee\.appointments\.map\(/); // every appointment rendered per sequence
assert.match(appointments, /marquee\.sequences\.map\(/); // primary + duplicate sequences preserved
assert.match(appointments, /aria-hidden=\{sequence\.isDuplicate \|\| undefined\}/); // duplicate stays hidden from AT
assert.match(appointments, /<h2 className="section-title">Season appointments<\/h2>/);
assert.ok(!appointments.includes('Featured appointments'), 'heading renamed to Season appointments');
assert.match(appointments, /View all appointments/);
assert.ok(!appointments.includes('More appointments are managed in the CMS'), 'copy no longer implies omitted appointments');
assert.match(appointments, /Season appointments are managed in the CMS/);
assert.ok(!appointments.includes('2026/27 Season Appointments'));
assert.ok(!/\b20\d{2}(?:\/\d{2,4})?\s+Season appointments/i.test(appointments), 'no year-specific heading');
console.log('Public visual/navigation checks passed.');
