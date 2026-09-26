import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isWithinPromotionWindow, resolvePromotion, detailString } from '../lib/promotion-rules.ts';
import { DEFAULT_POT_CLUB_PRODUCT_CODE, resolvePotClubProductCode, formatPotClubPrice, isValidProductCode } from '../lib/pot-club.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Window rules: inclusive start, exclusive end, open-ended bounds.
const window = { starts_at: '2026-09-15T00:00:00+10:00', ends_at: '2026-10-13T10:00:00+11:00' };
const start = Date.parse(window.starts_at);
const end = Date.parse(window.ends_at);
assert.equal(isWithinPromotionWindow(window, start - 1), false);
assert.equal(isWithinPromotionWindow(window, start), true);
assert.equal(isWithinPromotionWindow(window, end - 1), true);
assert.equal(isWithinPromotionWindow(window, end), false);
assert.equal(isWithinPromotionWindow({ starts_at: null, ends_at: null }, 0), true, 'no bounds means always');
assert.equal(isWithinPromotionWindow({ starts_at: 'not a date', ends_at: null }, start), false, 'corrupt dates never show');

const fallbackValue = { label: 'hardcoded' };
const map = (row) => ({ label: detailString(row, 'label', row.title) });
const row = (overrides = {}) => ({
  slug: 'junior-vouchers', kind: 'home_banner', title: 'From CMS', body: '', link_url: null, link_label: null, image_url: null,
  placement: 'home', details: {}, active: true, sort_order: 0, ...window, ...overrides,
});

// Table unavailable: hardcoded value, still gated by its own dates.
assert.deepEqual(resolvePromotion({ status: 'unavailable' }, 'junior-vouchers', start, { value: fallbackValue, live: true }, map), fallbackValue);
assert.equal(resolvePromotion({ status: 'unavailable' }, 'junior-vouchers', end, { value: fallbackValue, live: false }, map), null);
// Table present but no row for the slug: hardcoded fallback too.
assert.deepEqual(resolvePromotion({ status: 'ok', rows: [row({ slug: 'other' })] }, 'junior-vouchers', start, { value: fallbackValue, live: true }, map), fallbackValue);
// Row present: the CMS decides (dates, active flag, content).
assert.deepEqual(resolvePromotion({ status: 'ok', rows: [row()] }, 'junior-vouchers', start, { value: fallbackValue, live: true }, map), { label: 'From CMS' });
assert.deepEqual(resolvePromotion({ status: 'ok', rows: [row({ details: { label: 'Detail wins' } })] }, 'junior-vouchers', start, { value: fallbackValue, live: true }, map), { label: 'Detail wins' });
assert.equal(resolvePromotion({ status: 'ok', rows: [row({ active: false })] }, 'junior-vouchers', start, { value: fallbackValue, live: true }, map), null, 'switched off hides');
assert.equal(resolvePromotion({ status: 'ok', rows: [row()] }, 'junior-vouchers', end, { value: fallbackValue, live: true }, map), null, 'ended hides');
assert.equal(resolvePromotion({ status: 'ok', rows: [row({ starts_at: '2026-12-01T00:00:00+11:00' })] }, 'junior-vouchers', start, { value: fallbackValue, live: true }, map), null, 'scheduled hides until start');
assert.deepEqual(resolvePromotion({ status: 'ok', rows: [row({ ends_at: '2026-12-01T00:00:00+11:00' })] }, 'junior-vouchers', end, { value: fallbackValue, live: false }, map), { label: 'From CMS' }, 'CMS can extend a promotion');

// The seed migration carries the exact hardcoded values so behaviour is identical.
const migration = read('supabase/migrations/20260927090000_cms_promotions_media_newsletter.sql');
const promotions = read('lib/home-promotions.ts');
const cookie = read('lib/cookie-dough.ts');
const links = read('lib/public-links.ts');
for (const value of ["'2026-09-15T00:00:00+10:00'", "'2026-10-13T10:00:00+11:00'", "'Round 11'", "'15 September'", "'10 am on 13 October 2026'", "'Junior vouchers - up to $200'", "'https://www.getactive.vic.gov.au/vouchers/'", "'https://www.getactive.vic.gov.au/vouchers/apply-for-vouchers/'"]) {
  assert.ok(promotions.includes(value), `hardcoded voucher value ${value} kept as the fallback`);
  assert.ok(migration.includes(value), `seed carries voucher value ${value}`);
}
assert.ok(cookie.includes("Date.parse('2026-09-30T21:00:00+10:00')") && migration.includes("'2026-09-30T21:00:00+10:00'"), 'cookie dough deadline seeded exactly');
assert.ok(migration.includes("'Ends 30 September 2026 at 9 pm (Melbourne time).'"), 'cookie dough deadline label seeded exactly');
const cookieHref = links.match(/href: '(https:\/\/cookiedough[^']+)'/)[1];
assert.ok(migration.includes(`'${cookieHref}'`), 'cookie dough campaign link seeded exactly');
assert.match(promotions, /export const JUNIOR_GET_ACTIVE_VOUCHERS/, 'the hardcoded export stays for existing callers');
assert.match(promotions, /export function isPromotionActive\(promotion: HomePromotionWindow, now: number = Date\.now\(\)\): boolean/, 'isPromotionActive signature unchanged');
assert.match(read('lib/server/site-promotions.ts'), /return \{ status: 'unavailable' \}/, 'read failures fall back');

// Pot Club product selection falls back to the original product code.
assert.equal(DEFAULT_POT_CLUB_PRODUCT_CODE, 'pot_club_2026_27');
assert.equal(resolvePotClubProductCode(null), 'pot_club_2026_27');
assert.equal(resolvePotClubProductCode(''), 'pot_club_2026_27');
assert.equal(resolvePotClubProductCode('Bad Code!'), 'pot_club_2026_27');
assert.equal(resolvePotClubProductCode('pot_club_2027_28'), 'pot_club_2027_28');
assert.equal(isValidProductCode('pot_club_2026_27'), true);
assert.equal(formatPotClubPrice(100), 'AUD 100', 'original wording and price unchanged');
assert.equal(formatPotClubPrice(12.5), 'AUD 12.50');
assert.match(read('app/pot-club/page.tsx'), /Join the 2026\/2027 Pot Club for \$\{formatPotClubPrice\(plan\.price\)\}/);

console.log('Promotion date selection, CMS/hardcoded fallback, exact seed values and Pot Club product fallback passed.');
