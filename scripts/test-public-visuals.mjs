import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const nav = readFileSync('components/layout/Navbar.tsx', 'utf8');
// Suggested layout: News, Publications and Gallery sit under Club (no separate Community group).
for (const group of ['Cricket','Club','Get Involved','Shop']) assert.match(nav, new RegExp(`label: '${group}'`));
assert.ok(!/label: 'Community'/.test(nav), 'Community links merged into Club');
for (const route of ['/news','/publications','/gallery']) assert.match(nav, new RegExp(`label: 'Club', links: \\[[^\\]]*'${route}'`), `${route} listed under Club`);
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
assert.match(appointments, /<h2 id="season-appointments-title"[^>]*>Season appointments<\/h2>/);
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
assert.match(home, /\{ href: '\/join', label: 'Join the club' \}/, 'Get involved row has a Join link to /join');
assert.match(home, /href="\/sponsors" className="nd-link">All sponsors/);
assert.match(home, /href="\/sponsors#enquiry-form" className="nd-link">Become a sponsor/);
assert.match(readFileSync('app/sponsors/(list)/page.tsx', 'utf8'), /id="enquiry-form"/, 'Become a sponsor anchor exists');
// Suggested layout: next event, matches, then Coming up / Club news / Get involved
// (which carries the Dino Coach box), then promotions and sponsors.
const order = ['<NextEventSection />', '<FixturesSection />', '<ComingUpPreview />', '<ClubNewsPreview />', '<GetInvolvedSection />', '<PromotionsSection />', '<SponsorsSection />'].map((marker) => home.indexOf(marker));
assert.ok(order.every((index) => index > 0) && order.every((index, i) => i === 0 || index > order[i - 1]), 'home sections follow the suggested order');
assert.ok(!/2026-10-13/.test(home), 'voucher dates live in lib/home-promotions.ts');
// Home refresh: one sponsor "View all" link, no eyebrow pills, honest
// quick-link icons and Dino Coach copy that matches the 15-player game.
// Suggested layout: a static sponsor logo grid with one "All sponsors" link.
const sponsorsMarquee = readFileSync('components/home/SponsorsMarquee.tsx', 'utf8');
assert.ok(!home.includes('<SponsorsMarquee'), 'home shows a static logo grid, not the marquee');
assert.match(home, /<ul className="nd-logos"/);
assert.match(sponsorsMarquee, /\{showViewAll && <Link href="\/sponsors"/, 'marquee View all button is optional');
assert.equal(home.match(/>All sponsors</g)?.length, 1, 'a single All sponsors link definition on the home page');
assert.ok(!home.includes('section-eyebrow') && !home.includes('eyebrow-gold'), 'no eyebrow pills on the home page');
assert.ok(!appointments.includes('section-eyebrow'), 'no eyebrow pill on the appointments row');
assert.ok(!/'\u{1F3CF}': Trophy/u.test(home), 'cricket quick links are not a trophy');
assert.match(home, /QUICK_LINK_ICONS\[icon\.trim\(\)\]\) \|\| ArrowRight/, 'unmapped emoji fall back to a neutral icon, never raw text');
assert.ok(!/salary cap/i.test(home) && !/Build an XI/i.test(home), 'Dino Coach teaser does not describe an XI under a salary cap');
assert.match(home, /15-player NDCC squad with Dino Dollars/);
assert.match(home, /selectMatchDayBoard\(/, 'match-day board uses the tested selection helper');
// Next event hero: picked by the tested helper, honours a cancellation or
// postponement on the linked calendar entry, and says when events could not load.
assert.match(home, /selectNextEvent\(events, Date\.now\(\)\)/);
assert.match(home, /\.from\('calendar_events'\)\.select\('status'\)\.eq\('source_event_id', eventId\)/, 'hero reads the event\'s own calendar status, not the capped preview list');
assert.match(home, /const status = await linkedCalendarStatus\(event\.id\)/);
assert.match(home, /started \|\| status === 'postponed' \|\| status === 'unknown' \|\| event\.online_registration_enabled === false \? 'Event details'/, 'no booking once started, postponed, unreadable or switched to manual registration');
assert.match(home, /const started = Date\.parse\(event\.date\) <= Date\.now\(\);/);
assert.match(home, /status === 'cancelled' \? \(\s*<Link href="\/calendar"/, 'no booking button for a cancelled event');
assert.match(home, /Events could not be loaded right now/);
assert.ok(!/alt=""/.test(home), 'home images carry meaningful alt text');
assert.match(home, /Dates could not be loaded right now/, 'a calendar outage is not reported as an empty schedule');
for (const source of [home, readFileSync('app/fixtures/page.tsx', 'utf8')]) {
  assert.match(source, /\/\^Team discovery failed\/i\.test\(warning\)/, 'no "not yet published" claims from an incomplete team list');
}
assert.match(home, /Fixture not yet released by GCA/);
const homeDefaults = home.replace(/const GENERIC_CMS_COPY = \[[\s\S]*?\]\.map/, '');
for (const generic of ['Stay up to date with everything happening at NDCC.', 'Latest from NDCC', 'Explore the Club', 'seasoned cricketer']) {
  assert.ok(!homeDefaults.includes(generic), `generic copy "${generic}" is not a page default`);
}
// Promotions come from the CMS (lib/home-promotions.ts getJuniorGetActiveVouchers),
// which falls back to the dated JUNIOR_GET_ACTIVE_VOUCHERS values.
assert.match(home, /getJuniorGetActiveVouchers\(\)/);
assert.match(home, /getCookieDoughCampaign\(\)/);
const promotions = readFileSync('lib/home-promotions.ts', 'utf8');
assert.match(promotions, /startsAt: '2026-09-15T00:00:00\+10:00'/);
assert.match(promotions, /endsAt: '2026-10-13T10:00:00\+11:00'/);
const stats = readFileSync('components/home/HomeStatsStrip.tsx', 'utf8');
assert.match(stats, /getHistoryPremierships\(\)/, 'premiership stat comes from the CMS honour roll');
assert.ok(!stats.includes('fallbackHistoryPremierships'), 'premiership stat is not a static count');
// Cricket character: stitched seam accent, tonal mowing stripes, scoreboard
// numerals, and the drawn ball and stumps (approved by the club as an exception
// to "Use supplied assets only", Sep 2026). The drawings are hidden from
// assistive technology and the only motion stops for reduced motion and print.
const ball = readFileSync('components/home/CricketBall.tsx', 'utf8');
assert.equal((ball.match(/aria-hidden="true"/g) || []).length, 2, 'ball and stumps are decorative');
assert.match(home, /<CricketBall className="nd-hero-ball" \/>/);
assert.match(home, /<StumpsIcon className=/);
const css = readFileSync('app/globals.css', 'utf8');
assert.match(css, /@utility cricket-ball-turn \{\s*animation: ndcc-ball-turn 120s linear infinite;\s*\}/);
// The inner-page seam outline is part of the same approved concept and stays decorative.
// Tailwind CSS v4: .page-hero is an @utility, so the seam is its nested &::before (compiles to .page-hero::before).
assert.match(css, /@utility page-hero \{[\s\S]*?&::before \{\s*content: '';\s*@apply pointer-events-none/);
assert.match(readFileSync('AGENTS.md', 'utf8'), /faint ball-seam outline on inner page heroes \(`\.page-hero::before` in `app\/globals\.css`\)/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\), print \{\s*\.cricket-ball-turn \{\s*animation: none;\s*\}/);
assert.match(css, /@utility brand-rule \{[^}]*repeating-linear-gradient/);
assert.match(css, /@utility home-band \{[^}]*repeating-linear-gradient\(\s*90deg/);
assert.match(stats, /glass-panel scoreboard/);
// Publication PDFs embed with an iframe (object-src stays 'none').
const publication = readFileSync('app/publications/[slug]/page.tsx', 'utf8');
assert.ok(!publication.includes('<object'), 'no <object> embed blocked by the CSP');
assert.match(publication, /<iframe\s+src=\{publication\.document_url\}/);
const config = readFileSync('next.config.mjs', 'utf8');
assert.match(config, /"frame-src 'self' https:\/\/alduwuipmmnzorcgkcli\.supabase\.co /);
assert.match(config, /"object-src 'none'"/);
assert.match(config, /source: '\/newsletters', destination: '\/publications\?type=monthly_newsletter', permanent: false/);
assert.match(config, /source: '\/match-reports', destination: '\/publications\?type=weekly_match_report', permanent: false/);
console.log('Public visual/navigation checks passed.');
