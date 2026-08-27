import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { datetimeLocalToClubIso, toDatetimeLocalInClubTimezone } from '../lib/utils.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const news = read('lib/public-news.ts');
const publications = read('lib/public-publications.ts');
const sitemap = read('app/sitemap.ts');
const adminNews = read('app/admin/news/page.tsx');
const adminPublications = read('app/admin/publications/page.tsx');

for (const [name, source] of [['news', news], ['publications', publications], ['sitemap', sitemap]]) {
  assert.match(source, /published_at\.is\.null,published_at\.lte\.\$\{now\}/, `${name} must exclude future scheduled records without hiding legacy published records`);
}
for (const [name, source] of [['news CMS', adminNews], ['publications CMS', adminPublications]]) {
  assert.match(source, /Australia\/Melbourne/, `${name} must name the editor timezone`);
  assert.match(source, /Publish now/, `${name} must offer Publish now`);
  assert.match(source, /Schedule/, `${name} must offer Schedule`);
  assert.match(source, /Draft/, `${name} must offer Draft`);
}
assert.match(news, /\.eq\('id', id\)[\s\S]*?published_at\.is\.null,published_at\.lte\.\$\{now\}/, 'direct News route must be gated');
assert.match(publications, /\.eq\('slug', slug\)[\s\S]*?published_at\.is\.null,published_at\.lte\.\$\{now\}/, 'direct Publication route must be gated');
assert.equal(datetimeLocalToClubIso('2026-01-15T09:30'), '2026-01-14T22:30:00.000Z', 'Melbourne summer scheduling must use AEDT');
assert.equal(datetimeLocalToClubIso('2026-07-15T09:30'), '2026-07-14T23:30:00.000Z', 'Melbourne winter scheduling must use AEST');
assert.equal(toDatetimeLocalInClubTimezone('2026-01-14T22:30:00.000Z'), '2026-01-15T09:30', 'scheduled time must round-trip in Melbourne');
console.log('Scheduled publishing structural tests passed.');
