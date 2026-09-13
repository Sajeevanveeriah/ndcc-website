import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { buildDetailEntries } from '../lib/seo-sitemap.ts';
import { pageMetadata, authorJsonLd, breadcrumbJsonLd } from '../lib/seo.ts';
import { eventVenue } from '../lib/event-venue.ts';
import robots from '../app/robots.ts';
import config from '../next.config.mjs';

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
const now = new Date('2026-09-13T00:00:00Z');
const rows = {
  news: [{ id: 'live', title: 'News', published: true, published_at: null },
    { id: 'draft', published: false }, { id: 'future', published: true, published_at: '2027-01-01' },
    { id: 'test', title: 'Test Article', published: true }],
  events: [{ id: 'future-event', published: true, date: '2027-01-01' }],
  publications: [{ slug: 'issue', published: true, updated_at: '2026-08-01' },
    { slug: 'private', published: false }, { slug: 'scheduled', published: true, published_at: '2027-01-01' }],
  albums: [{ slug: 'album', published: true }, { slug: 'private', published: false }],
};
const entries = buildDetailEntries('https://www.ndcc.com.au/', rows, now);
check('published, draft and scheduled sitemap visibility', () => assert.deepEqual(entries.map(x => x.url), [
  'https://www.ndcc.com.au/news/live', 'https://www.ndcc.com.au/events/future-event',
  'https://www.ndcc.com.au/publications/issue', 'https://www.ndcc.com.au/gallery/album',
]));
check('lastmod uses only defensible updates', () => {
  assert.equal(entries.filter(x => x.lastModified).length, 1);
  assert.equal(entries[2].lastModified.toISOString(), '2026-08-01T00:00:00.000Z');
});
check('later sitemap requests do not manufacture update dates', () => assert.deepEqual(entries,
  buildDetailEntries('https://www.ndcc.com.au/', rows, new Date('2026-09-14'))));
check('invalid and future update timestamps omitted', () => {
  for (const updated_at of ['invalid', '2027-01-01']) assert.equal(buildDetailEntries('https://www.ndcc.com.au',
    { news: [], events: [], albums: [], publications: [{ slug: 'issue', published: true, updated_at }] }, now)[0].lastModified, undefined);
});
check('metadata keeps distinct pages and pagination canonical', () => {
  for (const path of ['/about', '/events/uuid', '/gallery/album', '/publications?type=monthly_newsletter&page=2']) {
    const meta = pageMetadata(path, 'Title', 'Description');
    assert.equal(meta.alternates.canonical, `https://www.ndcc.com.au${path}`);
    assert.equal(meta.openGraph.url, meta.alternates.canonical);
    assert.equal(meta.twitter.images[0].url, 'https://www.ndcc.com.au/images/logo.jpg');
  }
});
check('NDCC is an organisation author, named individuals remain people', () => {
  assert.equal(authorJsonLd('NDCC')['@type'], 'Organization');
  assert.equal(authorJsonLd('Example Author')['@type'], 'Person');
});
check('event venue lookup never invents a ground for an unknown venue', () => {
  assert.equal(eventVenue('Leopold Sporties').address.streetAddress, '135 Kensington Road');
  assert.equal(eventVenue('Grinter Reserve').address.addressLocality, 'Moolap');
  assert.equal(eventVenue('Club Rooms').address, undefined);
  assert.equal(eventVenue('Other venue').address, undefined);
});
check('breadcrumbs have ordered absolute destinations', () => {
  const b = breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Events', path: '/events' }]);
  assert.deepEqual(b.itemListElement.map(x => x.position), [1, 2]);
  assert.equal(b.itemListElement[1].item, 'https://www.ndcc.com.au/events');
});
check('robots keeps private APIs blocked and allows only named public exceptions', () => {
  const rule = robots().rules[0];
  assert.ok(rule.disallow.includes('/api/'));
  assert.ok(rule.disallow.includes('/admin/'));
  assert.ok(rule.allow.includes('/admin/login$'));
  assert.ok(rule.allow.includes('/api/apparel/products$'));
  assert.ok(!rule.allow.includes('/api/'));
});
const headers = await config.headers();
check('login, private and payment responses get restrictive headers', () => {
  for (const path of ['/admin/:path*', '/committee/:path*', '/payment', '/fantasy/account'])
    assert.ok(headers.find(x => x.source === path).headers.some(x => x.key === 'X-Robots-Tag' && x.value.includes('noindex')));
});

// Isolated query adapter: importing the real sitemap/catalogue executes no
// network requests and cannot access any production credentials or data.
let failTable = null;
let configured = true;
const tables = { ...rows, gallery_albums: rows.albums, fantasy_seasons: [], raffle_campaigns: [],
  apparel_products: [{ id: 'p1', slug: 'shirt', name: 'Shirt', price: 45, active: true }, { id: 'p2', active: false }],
  apparel_product_options: [{ product_id: 'p1', option_group: 'Sleeve', option_value: 'long', price_delta: 6, active: true }],
};
globalThis.__seoTestClient = { from(table) {
  const filters = []; let start = 0; let end = Infinity; let single = false;
  const q = { select() {return q;}, eq(k,v) {filters.push(x => x[k] === v);return q;},
    order() {return q;}, returns() {return q;}, range(a,b) {start=a;end=b;return q;}, limit(n) {end=n-1;return q;},
    in(k,values) {filters.push(x => values.includes(x[k]));return q;},
    or() {filters.push(x => x.published_at == null || Date.parse(x.published_at) <= Date.now());return q;},
    maybeSingle() {single=true;return q;},
    then(ok,bad) {let data=(tables[table] || []).filter(x => filters.every(f => f(x))).slice(start,end+1);
      return Promise.resolve(table === failTable ? { data: null, error: { code: '08006', message: 'test outage' } } :
        { data: single ? data[0] || null : data, error: null }).then(ok,bad);}
  }; return q;
}};
globalThis.__seoConfigured = () => configured;
const stub = 'data:text/javascript,' + encodeURIComponent(`export const createServerClient=()=>globalThis.__seoTestClient; export const isServerSupabaseConfigured=()=>globalThis.__seoConfigured();`);
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'next/server') return { url: 'data:text/javascript,' + encodeURIComponent(`export class NextResponse extends Response { static json(body, init) { return Response.json(body, init); } }`), shortCircuit: true };
  if (specifier === '@/lib/supabase-server') return { url: stub, shortCircuit: true };
  if (specifier.startsWith('@/')) return next(pathToFileURL(resolve(specifier.slice(2) + '.ts')).href, context);
  return next(specifier, context);
}});
const { default: sitemap } = await import('../app/sitemap.ts');
const { loadPublicCatalogue } = await import('../lib/apparel/public-catalogue.ts');
const map = await sitemap();
check('real sitemap excludes utility routes and includes gallery', () => {
  assert.ok(map.some(x => x.url.endsWith('/gallery/album')));
  assert.ok(!map.some(x => x.url.includes('/committee/')));
  assert.ok(map.filter(x => !x.url.includes('/publications/')).every(x => !x.lastModified));
});
failTable = 'events';
await assert.rejects(sitemap(), /unavailable/); checks++; console.log('PASS sitemap outage rejects instead of emitting a partial map');
failTable = null; configured = false;
await assert.rejects(sitemap(), /unavailable/); checks++; console.log('PASS unconfigured sitemap fails visibly');
configured = true;
const products = await loadPublicCatalogue();
check('real catalogue loader filters inactive products and attaches live option prices', () => {
  assert.equal(products.length, 1); assert.equal(products[0].price,45); assert.equal(products[0].options[0].price_delta,6);
});
failTable = 'apparel_products';
await assert.rejects(loadPublicCatalogue(), /unavailable/); checks++; console.log('PASS catalogue outage is not an empty success');
failTable = 'apparel_product_options';
await assert.rejects(loadPublicCatalogue(), /unavailable/); checks++; console.log('PASS option outage does not silently discard surcharges');
failTable = null; tables.apparel_products = [];
assert.deepEqual(await loadPublicCatalogue(), []); checks++; console.log('PASS real empty catalogue remains empty');
const { GET } = await import('../app/api/apparel/products/route.ts');
const emptyResponse = await GET();
check('catalogue HTTP response returns no-store empty success', () => {
  assert.equal(emptyResponse.status, 200); assert.equal(emptyResponse.headers.get('cache-control'), 'no-store');
});
failTable = 'apparel_products';
const failedResponse = await GET();
const failedBody = await failedResponse.json();
check('catalogue HTTP outage is 503 with retry and no leaked database message', () => {
  assert.equal(failedResponse.status, 503); assert.equal(failedResponse.headers.get('retry-after'), '60');
  assert.equal(failedBody.error, 'Catalogue temporarily unavailable.');
});
failTable = null;
const { getPublishedNews } = await import('../lib/public-news.ts');
const { getPublishedPublicationBySlug } = await import('../lib/public-publications.ts');
assert.equal(await getPublishedPublicationBySlug('invalid slug'), null);
assert.equal(await getPublishedNews({ id: 'missing' }), null);
assert.equal(await getPublishedNews({ id: 'test' }), null);
assert.equal(await getPublishedPublicationBySlug('missing'), null);
checks++; console.log('PASS missing and excluded records remain missing');
for (const table of ['news', 'publications']) {
  failTable = table;
  await assert.rejects(table === 'news' ? getPublishedNews({ id: 'live' }) : getPublishedPublicationBySlug('issue'));
  checks++; console.log(`PASS ${table} outage propagates instead of returning not found`);
}
failTable = null;
const { loadPublicKitchenMenu } = await import('../lib/public-kitchen.ts');
const { GET: kitchenGET } = await import('../app/api/kitchen/menu/route.ts');
tables.kitchen_menus = [{ id: 'menu', name: 'Current menu', is_active: true }];
tables.kitchen_items = [
  { id: 'visible', menu_id: 'menu', name: 'Current item', price: 7, is_hidden: false, is_available: true },
  { id: 'hidden', menu_id: 'menu', price: 1, is_hidden: true },
];
const kitchen = await loadPublicKitchenMenu();
check('kitchen loader preserves current prices and excludes hidden items', () => {
  assert.equal(kitchen.menu.name, 'Current menu');
  assert.deepEqual(kitchen.items.map(x => [x.id, x.price]), [['visible', 7]]);
});
failTable = 'kitchen_items';
await assert.rejects(loadPublicKitchenMenu(), /unavailable/);
const kitchenFailure = await kitchenGET();
check('kitchen outage returns retryable 503 instead of stale menu', () => {
  assert.equal(kitchenFailure.status, 503);
  assert.equal(kitchenFailure.headers.get('cache-control'), 'no-store');
  assert.equal(kitchenFailure.headers.get('retry-after'), '60');
});
failTable = null; tables.kitchen_menus = [];
assert.deepEqual(await loadPublicKitchenMenu(), { menu: null, items: [] });
checks++; console.log('PASS no active kitchen menu remains genuinely empty');
hooks.deregister(); delete globalThis.__seoTestClient; delete globalThis.__seoConfigured;
console.log(`${checks} SEO behaviour checks passed; database calls were isolated test doubles.`);
