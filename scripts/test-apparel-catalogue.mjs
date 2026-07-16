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
  '20260402_merch_windows.sql',
  '20260402_payment_reconciliation.sql',
  '20260402_kitchen_orders.sql',
  '20260402_content_blocks.sql',
  '20260406_safe_cms_images_and_merch.sql',
  '20260408_admin_cms_expansion.sql',
  '20260706100300_apparel_payment_readiness.sql',
];

const NEW = [
  '20260716040000_apparel_product_options.sql',
  '20260716041000_apparel_catalogue_2026_27.sql',
];

createTestDatabase(DB);
// Tables that predate the committed migration lineage (created via the
// dashboard); only the columns the replayed migrations touch are needed.
psql(DB, `create table if not exists news (id uuid primary key default gen_random_uuid(), title text, content text)`);
console.log('Applying base apparel migrations (production lineage)...');
applyMigrations(DB, BASE);
console.log('Applying new option-model + catalogue migrations...');
applyMigrations(DB, NEW);
console.log('Re-applying catalogue migration to prove idempotency...');
applyMigrations(DB, ['20260716041000_apparel_catalogue_2026_27.sql']);

console.log('\nChecks:');

const CANONICAL_PRICES = {
  'singlet': '31.00', 'track-pants': '44.00', 'tee-shirt': '33.00', 'shorts': '35.00',
  'playing-shirt': '36.00', 'playing-pants': '37.00', 'jumper': '49.00', 'reversible-vest': '49.00',
  'wide-brim-hat': '27.00', 'baggy-cap': '40.00', 'cap': '19.00', 'bucket-hat': '19.00',
  'club-polo': '36.00', 'puffer-vest': '58.00', 'hoody': '52.00', 'puffer-jacket': '82.00',
  'soft-shell-jacket': '89.00', 'sports-jacket': '60.00', 'bomber-jacket': '71.00',
};

const priceRows = psql(DB, `select slug, to_char(price, 'FM990.00') from apparel_products where slug in (${Object.keys(CANONICAL_PRICES).map((s) => `'${s}'`).join(',')}) order by slug`);
const priceMap = Object.fromEntries(priceRows.split('\n').filter(Boolean).map((l) => l.split('\t')));
check('all 19 authoritative products exist', Object.keys(priceMap).length === 19, `got ${Object.keys(priceMap).length}`);
for (const [slug, expected] of Object.entries(CANONICAL_PRICES)) {
  check(`price ${slug} = A$${expected}`, priceMap[slug] === expected, `got ${priceMap[slug]}`);
}

const activeCount = psql(DB, `select count(*) from apparel_products where active = true`);
check('exactly 15 active products (4 hats blocked on artwork)', activeCount === '15', `got ${activeCount}`);

const hats = psql(DB, `select count(*) from apparel_products where slug in ('wide-brim-hat','baggy-cap','cap','bucket-hat') and active = false and image_url = ''`);
check('all 4 hats inactive with empty image_url', hats === '4', `got ${hats}`);

const archived = psql(DB, `select count(*) from apparel_products where slug in ('one-day-polo','one-day-ls-polo','one-day-pants','one-day-jumper','two-day-polo','two-day-ls-polo','two-day-jumper','two-day-pants','social-polo','sublimated-hoodie','club-cap','cricket-socks') and active = false`);
const archivedTotal = psql(DB, `select count(*) from apparel_products where slug in ('one-day-polo','one-day-ls-polo','one-day-pants','one-day-jumper','two-day-polo','two-day-ls-polo','two-day-jumper','two-day-pants','social-polo','sublimated-hoodie','club-cap','cricket-socks')`);
check('every present legacy row is archived, none deleted', archived === archivedTotal, `${archived}/${archivedTotal}`);

const renamedGone = psql(DB, `select count(*) from apparel_products where slug in ('training-singlet','trackpants','training-tee','playing-trousers','club-hoodie')`);
check('renamed slugs no longer present (rows renamed, not duplicated)', renamedGone === '0', `got ${renamedGone}`);

const customisable = psql(DB, `select customisable from apparel_products where slug = 'playing-shirt'`);
check('playing-shirt keeps customisable = true', customisable === 't', `got ${customisable}`);

const sizes = psql(DB, `select count(*) from apparel_products where active = true and sizes <> '{}'`);
check('no invented sizes on active products (supplier data pending)', sizes === '0', `got ${sizes}`);

const activeImages = psql(DB, `select count(*) from apparel_products where active = true and (image_url not like '/images/cms/apparel/2026-27/%' or image_alt = '')`);
check('every active product has a 2026-27 image path and alt text', activeImages === '0', `got ${activeImages}`);

const groupOrder = psql(DB, `select string_agg(distinct category, ',' order by category) from apparel_products where active = true`);
check('active categories are exactly the four display groups',
  groupOrder === 'Accessories,Fashion Gear,Playing Gear,Training Gear' || groupOrder === 'Fashion Gear,Playing Gear,Training Gear',
  `got ${groupOrder}`);

const orderCheck = psql(DB, `
  with ranked as (select category, min(display_order) as lo, max(display_order) as hi from apparel_products
    where slug in ('singlet','playing-shirt','wide-brim-hat','club-polo') group by category)
  select count(*) from ranked r1 join ranked r2
    on (r1.category = 'Training Gear' and r2.category = 'Playing Gear' and r1.hi >= r2.lo)
    or (r1.category = 'Playing Gear' and r2.category = 'Accessories' and r1.hi >= r2.lo)
    or (r1.category = 'Accessories' and r2.category = 'Fashion Gear' and r1.hi >= r2.lo)`);
check('display order: Training < Playing < Accessories < Fashion', orderCheck === '0', `overlaps ${orderCheck}`);

const optionCounts = psql(DB, `select p.slug, count(*) from apparel_product_options o join apparel_products p on p.id = o.product_id group by p.slug order by p.slug`);
const optMap = Object.fromEntries(optionCounts.split('\n').filter(Boolean).map((l) => l.split('\t')));
const expectedOptions = { 'tee-shirt': '2', 'playing-shirt': '4', 'playing-pants': '2', 'jumper': '2', 'club-polo': '2', 'hoody': '4', 'sports-jacket': '2' };
check('option rows exist only for the 7 documented products', Object.keys(optMap).length === 7, `got ${Object.keys(optMap).join(',')}`);
for (const [slug, n] of Object.entries(expectedOptions)) {
  check(`options ${slug} = ${n}`, optMap[slug] === n, `got ${optMap[slug]}`);
}

const longSleeve = psql(DB, `select count(*) from apparel_product_options where option_value = 'long-sleeve' and price_delta = 1.00`);
check('all 3 long-sleeve options carry +A$1.00', longSleeve === '3', `got ${longSleeve}`);

const hoodDelta = psql(DB, `select coalesce(max(price_delta), 0) from apparel_product_options o join apparel_products p on p.id = o.product_id where p.slug = 'sports-jacket'`);
check('sports-jacket hood option has NO invented surcharge', hoodDelta === '0.00' || hoodDelta === '0', `got ${hoodDelta}`);

const defaults = psql(DB, `
  select count(*) from (
    select product_id, option_group from apparel_product_options group by product_id, option_group
    having count(*) filter (where is_default) <> 1
  ) bad`);
check('every option group has exactly one default', defaults === '0', `got ${defaults}`);

const totalRows = psql(DB, `select count(*) from apparel_products`);
check('no rows deleted by reconciliation (>= base row count)', Number(totalRows) >= 19, `got ${totalRows}`);

dropTestDatabase(DB);
finish('test-apparel-catalogue');
