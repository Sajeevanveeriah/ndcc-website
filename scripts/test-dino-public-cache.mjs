// The shared 60-second public Dino Coach cache: public read surfaces use it,
// money and squad writes never do, and admin/cron writers clear it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const cache = read('lib/server/dino-public-cache.ts');
const CACHE_IMPORT = /@\/lib\/server\/dino-public-cache/;

// Every loader is wrapped with the shared tag and a short lifetime.
assert.match(read('lib/dino-coach/public-cache-tag.ts'), /DINO_PUBLIC_CACHE_TAG = 'dino-public'/);
assert.match(read('lib/dino-coach/public-cache-tag.ts'), /DINO_PUBLIC_CACHE_SECONDS = 60;/);
const wrapped = cache.match(/unstable_cache\(/g) || [];
assert.equal(wrapped.length, 8, 'eight cached public loaders');
assert.match(cache, /const options = \{ revalidate: DINO_PUBLIC_CACHE_SECONDS, tags: \[DINO_PUBLIC_CACHE_TAG\] \};/);
assert.equal((cache.match(/\n  options,\n\);/g) || []).length, 7, 'loaders use the shared tag and lifetime');
assert.match(cache, /\['dino-public-manager-standings-v1'\],\n  \{ \.\.\.options, tags: \[DINO_PUBLIC_CACHE_TAG, DINO_STANDINGS_CACHE_TAG\] \},/, 'standings also carry their own tag');
// A failed launch check throws (never cached) instead of returning "off".
assert.match(cache, /if \(seasonError\) throw new Error/);
assert.match(cache, /if \(settingsError\) throw new Error/);
// The Map returned by getPlayerStats is cached as entries and rebuilt.
assert.match(cache, /\[\.\.\.\(await getPlayerStats\(seasonId, players\)\)\.entries\(\)\]/);
assert.match(cache, /return new Map\(await getCachedPlayerStatsEntries/);
console.log('PASS cached loaders share one tag and a 60-second lifetime, and failures are not cached');

// Public read surfaces use the cache.
for (const file of [
  'app/fantasy/layout.tsx', 'app/api/public/dino-coach-status/route.ts', 'app/api/fantasy/players/route.ts',
  'app/api/fantasy/seasons/route.ts', 'app/api/fantasy/manager-leaderboard/route.ts', 'app/fantasy/page.tsx',
  'app/fantasy/players/page.tsx', 'app/fantasy/rules/page.tsx', 'app/fantasy/leaderboard/page.tsx', 'app/fantasy/manager-leaderboard/page.tsx',
]) assert.match(read(file), CACHE_IMPORT, `${file} reads through the public cache`);
console.log('PASS public Dino Coach pages and feeds read through the cache');

// Writes and money paths always read the database directly.
for (const file of [
  'app/api/fantasy/squad/route.ts', 'app/api/fantasy/transfers/route.ts', 'app/api/fantasy/checkout/route.ts',
  'app/api/fantasy/manager/route.ts', 'app/api/fantasy/rules/accept/route.ts', 'app/api/fantasy/chips/route.ts',
  'app/api/fantasy/leagues/route.ts', 'app/api/fantasy/squad/carryover/route.ts', 'app/api/club-account/dino-coach/route.ts',
]) assert.doesNotMatch(read(file), CACHE_IMPORT, `${file} must not use cached reads`);
console.log('PASS squad, transfer, checkout, registration and account paths never use cached reads');

// Admin and scheduled Dino writers clear the cache so changes show immediately.
const revalidate = read('lib/server/revalidate-public.ts');
assert.match(revalidate, /export function revalidateDinoPublicCache\(\): void \{\n  safe\(\(\) => revalidateTag\(DINO_PUBLIC_CACHE_TAG\)\);/);
assert.match(revalidate, /if \(!resource \|\| resource\.startsWith\('fantasy'\)\) revalidateDinoPublicCache\(\);/);
for (const file of [
  'app/api/admin/fantasy/players/route.ts', 'app/api/admin/fantasy/seasons/route.ts', 'app/api/admin/fantasy/imports/[id]/route.ts',
  'app/api/admin/fantasy/pricing/route.ts', 'app/api/admin/fantasy/scores/route.ts', 'app/api/admin/fantasy/sync/route.ts',
  'app/api/admin/fantasy/managers/route.ts', 'app/api/admin/fantasy/baseline-import/route.ts', 'app/api/cron/dino-pricing/route.ts',
  'app/api/cron/playhq-fantasy-sync/route.ts', 'app/api/internal/fantasy/release-run/route.ts',
]) assert.match(read(file), /revalidateDinoPublicCache\(\);/, `${file} clears the public Dino cache after a write`);
assert.match(read('app/api/admin/fantasy/settings/route.ts'), /revalidatePublicContent\('fantasySettings'\)/);
// Manual sync start and continue both process batches, so both clear the cache.
assert.equal((read('app/api/admin/fantasy/sync/route.ts').match(/processFantasySyncBatch\([^\n]*\n(?:\s*\/\/[^\n]*\n)?\s*revalidateDinoPublicCache\(\);/g) || []).length, 2);
// Participant saves refresh only the standings (squad value tiebreak, team names).
assert.match(revalidate, /export function revalidateDinoStandingsCache\(\): void \{\n  safe\(\(\) => revalidateTag\(DINO_STANDINGS_CACHE_TAG\)\);/);
for (const file of ['app/api/fantasy/squad/route.ts', 'app/api/fantasy/transfers/route.ts', 'app/api/fantasy/manager/route.ts']) {
  assert.match(read(file), /revalidateDinoStandingsCache\(\);\n\s*return NextResponse\.json\(\{\s*success: ?true/, `${file} refreshes standings after a successful save`);
}
console.log('PASS admin and scheduled Dino writers clear the public cache');
