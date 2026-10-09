import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COOKIE_DOUGH_FUNDRAISER_LINK, FACILITY_BOOKING_LINK } from '../lib/public-links.ts';

assert.deepEqual(
  FACILITY_BOOKING_LINK,
  {
    href: 'https://docs.google.com/forms/d/e/1FAIpQLScR4QEPmmzozezpWhk6x1M90b4x0k4WIzYx5bDdSBVwe0I9pQ/viewform?usp=header',
    label: 'Book Facilities',
    target: '_blank',
    rel: 'noopener noreferrer',
  },
  'The facilities booking CTA must retain its public URL and safe external-link contract.',
);

const facilitiesPage = await readFile(new URL('../app/facilities/page.tsx', import.meta.url), 'utf8');
assert.match(facilitiesPage, /href=\{FACILITY_BOOKING_LINK\.href\}/, 'Facilities page must render the booking URL.');
assert.match(facilitiesPage, /\{FACILITY_BOOKING_LINK\.label\}/, 'Facilities page must render the booking label.');

assert.equal(
  COOKIE_DOUGH_FUNDRAISER_LINK.href,
  'https://cookiedough.com.au/school/69fbe85f1fc836e997e6f70d/view?data=%7B%22campaignId%22%3A%226a990b65d4b1ae7e61e32a1a%22%2C%22return%22%3A%22%2Fcampaign%2F6a990b65d4b1ae7e61e32a1a%2Fview%22%7D',
  'The fundraiser must retain the exact supplied campaign and return identifiers.',
);
assert.equal(COOKIE_DOUGH_FUNDRAISER_LINK.target, '_blank');
assert.equal(COOKIE_DOUGH_FUNDRAISER_LINK.rel, 'noopener noreferrer');

const cookieDoughPage = await readFile(new URL('../app/fundraising/cookie-dough/page.tsx', import.meta.url), 'utf8');
const navbar = await readFile(new URL('../components/layout/Navbar.tsx', import.meta.url), 'utf8');
const homepage = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
const sitemap = await readFile(new URL('../lib/server/sitemap-entries.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20260904070234_cookie_dough_fundraiser_links.sql', import.meta.url), 'utf8');

assert.match(cookieDoughPage, /Register &amp; Start Fundraising/);
assert.match(cookieDoughPage, /Buy Cookie Dough/);
assert.match(cookieDoughPage, /How it works/);
assert.match(cookieDoughPage, /COOKIE_DOUGH_FUNDRAISER_LINK/);
assert.doesNotMatch(cookieDoughPage, /stripe|checkout\.sessions|payment_intent/i, 'Fundraiser payments must remain on the official provider platform.');
assert.match(navbar, /Cookie Dough Fundraiser.*\/fundraising\/cookie-dough/);
// Every fundraiser sits in one Fundraisers section of the Shop & Fundraisers
// menu (desktop and mobile render the same groups); Cookie Dough moved there
// from Get Involved.
assert.match(navbar, /const FUNDRAISERS_SECTION = 'Fundraisers';/);
assert.doesNotMatch(navbar, /label: 'Raffles'/);
const fundraisersSection = navbar.match(/\{ heading: FUNDRAISERS_SECTION, links: \[([\s\S]*?)\] \},/);
assert.ok(fundraisersSection, 'Fundraisers section must exist');
for (const href of ['/raffle', '/reverse-raffle', '/prize-wheel', '/spin-the-wheel', '/fundraising/cookie-dough']) {
  assert.ok(fundraisersSection[1].includes(`href: '${href}'`), `${href} belongs in Fundraisers`);
}
assert.ok(!/label: 'Get Involved'[^\n]*cookie-dough/.test(navbar), 'Cookie Dough must not stay under Get Involved');
assert.match(navbar, /section\.heading === FUNDRAISERS_SECTION/);
// Four top-level menus; every public destination keeps a menu entry.
for (const group of ['Cricket', 'Club', 'Get Involved', 'Shop & Fundraisers']) assert.match(navbar, new RegExp(`label: '${group}', sections:`));
for (const href of ['/this-week', '/team-sheets', '/teams', '/fixtures', '/calendar', '/fantasy', '/about', '/about#club-history', '/facilities', '/news', '/publications', '/winners', '/gallery', '/contact', '/join', '/volunteer', '/events', '/sponsors', '/player-sponsors', '/merchandise', '/pot-club', '/pay-balance', '/kitchen', '/fundraising']) {
  assert.ok(navbar.includes(`href: '${href}'`), `${href} must stay in the menu`);
}
assert.match(homepage, /CookieDoughFundraiserFeature/);
assert.match(sitemap, /\/fundraising\/cookie-dough/);
assert.match(migration, /WHERE NOT EXISTS/);
assert.match(migration, /\/fundraising\/cookie-dough/);

console.log('Public layout contract checks passed.');
console.log('Cookie dough fundraiser integration checks passed.');
