// Guards for the site-review quick wins: ISR pages never cache a failure
// note, mobile gutters on full-width sections, no raw database errors in
// public API responses, readable contrast fixes and lean shared assets.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');

const sponsors = read('components/home/PlayerSponsorsSection.tsx');
assert.match(sponsors, /if \(error\) \{[\s\S]*?throw new Error\('Player sponsors temporarily unavailable'\)/, 'player sponsors throws on a database error so ISR keeps the last good page');
assert.match(sponsors, /container-width px-4 sm:px-6 lg:px-8/, 'player sponsor cards have a mobile gutter');
assert.match(read('components/donations/DonationInvitation.tsx'), /container-width px-4 py-8 sm:px-6 lg:px-8/);
assert.doesNotMatch(read('components/donations/DonationInvitation.tsx'), /addEventListener\('focus'/, 'no refetch on every window focus');
assert.match(read('app/error.tsx'), /container-width px-4 py-16/);

const contentBlocks = read('app/api/content-blocks/route.ts');
assert.doesNotMatch(contentBlocks, /error: error\.message/, 'content-blocks does not return raw database errors');
assert.match(read('app/api/public/season-appointments/route.ts'), /\{ success: false, error: 'Season appointments are temporarily unavailable\.' \}/, 'season appointments returns a generic message');
assert.match(read('app/api/cron/dino-registration/route.ts'), /console\.error\('\[dino-registration\] Cron run failed:'/);

assert.doesNotMatch(read('app/fixtures/page.tsx'), /text-white\/60/, 'fixtures hero caption meets contrast');
assert.doesNotMatch(read('app/merchandise/MerchandiseClient.tsx'), /text-gray-400/, 'merchandise empty state meets contrast');
const sponsorPage = read('app/sponsors/page.tsx');
assert.match(sponsorPage, /underline underline-offset-4 transition-colors hover:text-maroon-500 dark:text-maroon-200">\{CLUB_PHONE\}/, 'inline phone link is underlined');
assert.match(sponsorPage, /whitespace-nowrap text-right font-display/, 'package prices do not wrap');

assert.ok(statSync('app/icon.jpg').size < 100_000, 'favicon stays under 100 KB');
assert.ok(statSync('public/images/Connection_Bri_Hayes_Rev1.webp').size < 150_000, 'footer background stays under 150 KB');

console.log('PASS: site quick wins - ISR failure handling, gutters, error hygiene, contrast and lean shared assets.');
