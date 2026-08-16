#!/usr/bin/env node
// Regression test for the 2026/27 apparel catalogue migrations.
//
// Replays the real base apparel migrations into a throwaway database (the
// same files production ran), then applies the two new migrations and
// asserts the reconciled state. The catalogue migration is applied TWICE to
// prove idempotency.

import {
  createTestDatabase, dropTestDatabase, applyMigrations, psql, check, finish,
} from './lib/local-db.mjs';

const DB = 'ndcc_test_apparel';

const BASE = [
  '20260401_custom_committee_auth.sql',
  '20260402000500_merch_windows.sql',
  '20260402000600_payment_reconciliation.sql',
  '20260402000300_kitchen_orders.sql',
  '20260402000100_content_blocks.sql',
  '20260406000100_safe_cms_images_and_merch.sql',
  '20260408000100_admin_cms_expansion.sql',
  '20260706205638_apparel_payment_readiness.sql',
];

const FOUNDATION = [
  '20260716040000_apparel_product_options.sql',
  '20260716041000_apparel_catalogue_2026_27.sql',
];
const RETAIL = '20260809105226_apparel_catalogue_retail_2026_27.sql';

createTestDatabase(DB);
// Tables that predate the committed migration lineage (created via the
// dashboard); only the columns the replayed migrations touch are needed.
psql(DB, `create table if not exists news (id uuid primary key default gen_random_uuid(), title text, content text)`);
console.log('Applying base apparel migrations (production lineage)...');
applyMigrations(DB, BASE);
console.log('Applying new option-model + catalogue migrations...');
applyMigrations(DB, FOUNDATION);
psql(DB, `update apparel_products set payment_mode = 'stripe_payment_link', payment_link_url = 'https://example.invalid/preserve', stripe_price_id = 'price_preserve', checkout_enabled = true where slug = 'playing-shirt'`);
applyMigrations(DB, [RETAIL]);
console.log('Re-applying retail catalogue migration to prove idempotency...');
applyMigrations(DB, [RETAIL]);

console.log('\nChecks:');

const CANONICAL_PRICES = {
  'singlet': '40.00', 'track-pants': '55.00', 'tee-shirt': '44.00', 'shorts': '42.00',
  'playing-shirt': '45.00', 'playing-pants': '55.00', 'jumper': '75.00',
  'reversible-jumper': '90.00', 'vest': '65.00', 'reversible-vest': '85.00',
  'wide-brim-hat': '45.00', 'baggy-cap': '45.00', 'cap': '25.00',
  'club-polo': '45.00', 'puffer-vest': '85.00', 'hoody': '65.00', 'puffer-jacket': '130.00',
  'soft-shell-jacket': '90.00', 'spray-jacket': '75.00', 'summit-hoodie': '65.00',
  'boss-top-fleece': '60.00', 'retro-jacket': '110.00',
};

const priceRows = psql(DB, `select slug, to_char(price, 'FM990.00') from apparel_products where slug in (${Object.keys(CANONICAL_PRICES).map((s) => `'${s}'`).join(',')}) order by slug`);
const priceMap = Object.fromEntries(priceRows.split('\n').filter(Boolean).map((l) => l.split('\t')));
check('all 22 authoritative products exist', Object.keys(priceMap).length === 22, `got ${Object.keys(priceMap).length}`);
for (const [slug, expected] of Object.entries(CANONICAL_PRICES)) {
  check(`price ${slug} = A$${expected}`, priceMap[slug] === expected, `got ${priceMap[slug]}`);
}

const activeCount = psql(DB, `select count(*) from apparel_products where active = true`);
check('exactly 20 products with supplied artwork are active', activeCount === '20', `got ${activeCount}`);

const missingImages = psql(DB, `select count(*) from apparel_products where slug in ('wide-brim-hat','baggy-cap') and active = false and image_url = ''`);
check('two products absent from supplied artwork remain inactive', missingImages === '2', `got ${missingImages}`);

const cap = psql(DB, `select count(*) from apparel_products where slug = 'cap' and active = true and image_url like '/images/cms/apparel/2026-27/%'`);
check('workbook cap artwork is published', cap === '1', `got ${cap}`);

const archived = psql(DB, `select count(*) from apparel_products where slug in ('one-day-polo','one-day-ls-polo','one-day-pants','one-day-jumper','two-day-polo','two-day-ls-polo','two-day-jumper','two-day-pants','social-polo','sublimated-hoodie','club-cap','cricket-socks','bucket-hat','sports-jacket','bomber-jacket') and active = false`);
const archivedTotal = psql(DB, `select count(*) from apparel_products where slug in ('one-day-polo','one-day-ls-polo','one-day-pants','one-day-jumper','two-day-polo','two-day-ls-polo','two-day-jumper','two-day-pants','social-polo','sublimated-hoodie','club-cap','cricket-socks','bucket-hat','sports-jacket','bomber-jacket')`);
check('every present legacy row is archived, none deleted', archived === archivedTotal, `${archived}/${archivedTotal}`);

const renamedGone = psql(DB, `select count(*) from apparel_products where slug in ('training-singlet','trackpants','training-tee','playing-trousers','club-hoodie')`);
check('renamed slugs no longer present (rows renamed, not duplicated)', renamedGone === '0', `got ${renamedGone}`);

const customisable = psql(DB, `select string_agg(slug, ',' order by slug) from apparel_products where active and customisable`);
check('only the five workbook name/number garments are customisable',
  customisable === 'jumper,playing-shirt,reversible-jumper,reversible-vest,vest', `got ${customisable}`);

const sizes = psql(DB, `select count(*) from apparel_products where slug in (${Object.keys(CANONICAL_PRICES).map((s) => `'${s}'`).join(',')}) and sizes <> '{}'`);
check('all 22 catalogue products have workbook-derived allowed sizes', sizes === '22', `got ${sizes}`);

const commonSizes = psql(DB, `select array_to_string(sizes, ',') from apparel_products where slug = 'playing-shirt'`);
check('sized apparel carries the complete workbook size guide', commonSizes === 'K10,K12,K14,K16,XS,S,M,L,XL,2XL,3XL,4XL,5XL,6XL', `got ${commonSizes}`);

const oneSize = psql(DB, `select count(*) from apparel_products where slug in ('wide-brim-hat','baggy-cap','cap') and sizes = array['One Size']::text[]`);
check('all headwear is explicitly One Size', oneSize === '3', `got ${oneSize}`);

const activeImages = psql(DB, `select count(*) from apparel_products where active = true and image_url <> '' and (image_url not like '/images/cms/apparel/2026-27/%' or image_alt = '')`);
check('every supplied active image has a 2026-27 path and alt text', activeImages === '0', `got ${activeImages}`);

const preservedPayment = psql(DB, `select payment_mode || '|' || payment_link_url || '|' || stripe_price_id || '|' || checkout_enabled::text from apparel_products where slug = 'playing-shirt'`);
check('catalogue replay preserves existing product-level Stripe configuration',
  preservedPayment === 'stripe_payment_link|https://example.invalid/preserve|price_preserve|true', `got ${preservedPayment}`);

const groupOrder = psql(DB, `select string_agg(distinct category, ',' order by category) from apparel_products where active = true`);
check('active categories are exactly the four display groups',
  groupOrder === 'Club and Outerwear,Headwear,Playing Gear,Training Gear',
  `got ${groupOrder}`);

const orderCheck = psql(DB, `
  with ranked as (select category, min(display_order) as lo, max(display_order) as hi from apparel_products
    where slug in ('singlet','playing-shirt','wide-brim-hat','club-polo') group by category)
  select count(*) from ranked r1 join ranked r2
    on (r1.category = 'Training Gear' and r2.category = 'Playing Gear' and r1.hi >= r2.lo)
    or (r1.category = 'Playing Gear' and r2.category = 'Headwear' and r1.hi >= r2.lo)
    or (r1.category = 'Headwear' and r2.category = 'Club and Outerwear' and r1.hi >= r2.lo)`);
check('display order: Training < Playing < Headwear < Club and Outerwear', orderCheck === '0', `overlaps ${orderCheck}`);

const optionCounts = psql(DB, `select p.slug, count(*) from apparel_product_options o join apparel_products p on p.id = o.product_id where o.active group by p.slug order by p.slug`);
const optMap = Object.fromEntries(optionCounts.split('\n').filter(Boolean).map((l) => l.split('\t')));
const expectedOptions = { 'singlet': '2', 'tee-shirt': '2', 'playing-shirt': '4', 'playing-pants': '2', 'jumper': '2', 'vest': '2', 'club-polo': '2' };
check('option rows exist only for the 7 documented products', Object.keys(optMap).length === 7, `got ${Object.keys(optMap).join(',')}`);
for (const [slug, n] of Object.entries(expectedOptions)) {
  check(`options ${slug} = ${n}`, optMap[slug] === n, `got ${optMap[slug]}`);
}

const longSleeve = psql(DB, `select count(*) from apparel_product_options where active and option_value = 'long-sleeve' and price_delta = 6.00`);
check('all 3 documented long-sleeve options carry +A$6.00', longSleeve === '3', `got ${longSleeve}`);

const defaults = psql(DB, `
  select count(*) from (
    select product_id, option_group from apparel_product_options where active group by product_id, option_group
    having count(*) filter (where is_default) <> 1
  ) bad`);
check('every option group has exactly one default', defaults === '0', `got ${defaults}`);

const totalRows = psql(DB, `select count(*) from apparel_products`);
check('no rows deleted by reconciliation (>= base row count)', Number(totalRows) >= 19, `got ${totalRows}`);

const parentAwarePolicy = psql(DB, `
  select count(*) from pg_policies
  where schemaname = 'public'
    and tablename = 'apparel_product_options'
    and policyname = 'apparel_product_options_public_read_active'
    and qual like '%apparel_products%'
    and qual like '%active%'`);
check('public option policy requires an active parent product', parentAwarePolicy === '1', `got ${parentAwarePolicy}`);

dropTestDatabase(DB);
finish('test-apparel-catalogue');
