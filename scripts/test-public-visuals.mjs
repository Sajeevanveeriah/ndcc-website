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
// Internal CMS wording must not be shown to the public (audit F44).
assert.ok(!appointments.includes('managed in the CMS'), 'marquee must not expose internal CMS wording');
assert.ok(!readFileSync('app/page.tsx', 'utf8').includes('managed in the CMS'), 'home skeleton must not expose internal CMS wording');
assert.ok(!appointments.includes('2026/27 Season Appointments'));
assert.ok(!/\b20\d{2}(?:\/\d{2,4})?\s+Season appointments/i.test(appointments), 'no year-specific heading');

// Home page structure (audit F38, F39, F42, F45, F48).
const home = readFileSync('app/page.tsx', 'utf8');
assert.ok(!home.includes('ctaUrl="/contact"'), 'hero Join CTA fallback goes to /join');
assert.match(home, /ctaUrl="\/join"/);
assert.match(home, /cta_url \|\| '\/join'/);
assert.match(home, /<Link href="\/join" className="btn-accent[^"]*">\s*Join the Club/, 'bottom band has a Join CTA to /join');
assert.match(home, /href="\/sponsors" className="btn-secondary">\s*View all sponsors/);
assert.match(home, /href="\/sponsors#enquiry-form" className="btn-primary">\s*Become a sponsor/);
assert.match(readFileSync('app/sponsors/page.tsx', 'utf8'), /id="enquiry-form"/, 'Become a sponsor anchor exists');
const order = ['<ClubUpdatesSection />', '<WhatsOnSection />', '<SponsorsSection />', '<FantasyTeaserSection />'].map((marker) => home.indexOf(marker));
assert.ok(order.every((index) => index > 0) && order.every((index, i) => i === 0 || index > order[i - 1]), 'Dino Coach block follows news, events and sponsors');
assert.ok(!/2026-10-13/.test(home), 'voucher dates live in lib/home-promotions.ts');
assert.match(home, /isPromotionActive\(VOUCHERS\)/);
const promotions = readFileSync('lib/home-promotions.ts', 'utf8');
assert.match(promotions, /startsAt: '2026-09-15T00:00:00\+10:00'/);
assert.match(promotions, /endsAt: '2026-10-13T10:00:00\+11:00'/);
const stats = readFileSync('components/home/HomeStatsStrip.tsx', 'utf8');
assert.match(stats, /getHistoryPremierships\(\)/, 'premiership stat comes from the CMS honour roll');
assert.ok(!stats.includes('fallbackHistoryPremierships'), 'premiership stat is not a static count');
console.log('Public visual/navigation checks passed.');
