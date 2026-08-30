#!/usr/bin/env node
// Unit tests for lib/apparel/pricing.ts and lib/apparel/server-catalogue.ts
// (pure logic — no network, no database).
//
// Run: npm run test:apparel-pricing

import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Stage the TS modules with the @/ alias rewritten so node --experimental-strip-types can load them.
const stage = mkdtempSync(path.join(tmpdir(), 'ndcc-pricing-'));
const pricingSrc = readFileSync(path.join(repoRoot, 'lib/apparel/pricing.ts'), 'utf8');
writeFileSync(path.join(stage, 'pricing.ts'), pricingSrc);
const personalisationSrc = readFileSync(path.join(repoRoot, 'lib/apparel/personalisation.ts'), 'utf8');
writeFileSync(path.join(stage, 'personalisation.ts'), personalisationSrc);
const catalogueSrc = readFileSync(path.join(repoRoot, 'lib/apparel/server-catalogue.ts'), 'utf8')
  .replace("@/lib/apparel/pricing", './pricing.ts')
  .replace("@/lib/apparel/personalisation", './personalisation.ts');
writeFileSync(path.join(stage, 'server-catalogue.ts'), catalogueSrc);

const { computeUnitPrice } = await import(pathToFileURL(path.join(stage, 'pricing.ts')).href);
const { validatePersonalisation } = await import(pathToFileURL(path.join(stage, 'personalisation.ts')).href);
const { priceOrderItems } = await import(pathToFileURL(path.join(stage, 'server-catalogue.ts')).href);

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

const option = (group, value, label, delta, isDefault, order = 1) => ({
  option_group: group, option_value: value, option_label: label,
  price_delta: delta, is_default: isDefault, active: true, display_order: order,
});

const teeShirt = {
  slug: 'tee-shirt', name: 'Tee Shirt', price: 33,
  sizes: ['K10', 'K12', 'XS', 'S', 'M', 'L', 'XL', '2XL'],
  customisable: false,
  options: [
    option('Sleeve length', 'short-sleeve', 'Short sleeve', 0, true, 1),
    option('Sleeve length', 'long-sleeve', 'Long sleeve', 1, false, 2),
  ],
};

const hoody = {
  slug: 'hoody', name: 'Hoody', price: 52,
  sizes: ['K10', 'K12', 'XS', 'S', 'M', 'L', 'XL', '2XL'],
  customisable: false,
  options: [
    option('Style', 'pullover', 'Pullover', 0, true, 1),
    option('Style', 'zipped', 'Zipped', 1, false, 2),
    option('Fabric', 'standard', 'Standard', 0, true, 1),
    option('Fabric', 'fleece', 'Fleece', 1, false, 2),
  ],
};

test('base price with defaults when nothing selected', () => {
  const r = computeUnitPrice(teeShirt, undefined);
  assert.equal(r.ok, true);
  assert.equal(r.unitPrice, 33);
});

test('long sleeve surcharge applies (+$1.00)', () => {
  const r = computeUnitPrice(teeShirt, { 'Sleeve length': 'long-sleeve' });
  assert.equal(r.ok, true);
  assert.equal(r.unitPrice, 34);
  assert.deepEqual(r.applied.map((a) => a.value), ['long-sleeve']);
});

test('independent hoody groups stack: zipped + fleece = +$2.00', () => {
  const r = computeUnitPrice(hoody, { Style: 'zipped', Fabric: 'fleece' });
  assert.equal(r.ok, true);
  assert.equal(r.unitPrice, 54);
});

test('unknown option group is rejected', () => {
  const r = computeUnitPrice(teeShirt, { Colour: 'maroon' });
  assert.equal(r.ok, false);
});

test('invalid option value is rejected', () => {
  const r = computeUnitPrice(teeShirt, { 'Sleeve length': 'sleeveless' });
  assert.equal(r.ok, false);
});

test('inactive options are not selectable', () => {
  const withInactive = {
    ...teeShirt,
    options: teeShirt.options.map((o) => (o.option_value === 'long-sleeve' ? { ...o, active: false } : o)),
  };
  const r = computeUnitPrice(withInactive, { 'Sleeve length': 'long-sleeve' });
  assert.equal(r.ok, false);
});

test('float-safe cents arithmetic (0.1 + 0.2 style deltas)', () => {
  const product = {
    slug: 'x', name: 'X', price: 10.1,
    options: [option('G', 'a', 'A', 0.2, true)],
  };
  const r = computeUnitPrice(product, { G: 'a' });
  assert.equal(r.ok, true);
  assert.equal(r.unitPrice, 10.3);
});

const catalogue = [
  { id: '1', ...teeShirt, active: true },
  { id: '2', ...hoody, active: true },
];

test('priceOrderItems recomputes totals server-side and ignores client price', () => {
  const r = priceOrderItems(catalogue, [
    { slug: 'tee-shirt', size: 'M', quantity: 2, price: 0.01, options: { 'Sleeve length': 'long-sleeve' } },
    { slug: 'hoody', size: 'L', quantity: 1, options: { Style: 'zipped' } },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.totalAmount, 34 * 2 + 53);
  assert.equal(r.items[0].price, 34);
  assert.equal(r.clientPriceMismatches.length, 1);
});

test('priced order history contains only server-validated item fields', () => {
  const r = priceOrderItems(catalogue, [{
    slug: 'tee-shirt',
    size: 'M',
    quantity: 1,
    price: 0.01,
    attacker_controlled: { nested: 'must not persist' },
  }]);
  assert.equal(r.ok, true);
  assert.equal('attacker_controlled' in r.items[0], false);
  assert.deepEqual(
    Object.keys(r.items[0]).sort(),
    ['applied_options', 'base_price', 'name', 'price', 'quantity', 'size', 'slug'].sort(),
  );
});

test('unknown product is rejected outright', () => {
  const r = priceOrderItems(catalogue, [{ slug: 'not-a-product', quantity: 1 }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /Unknown product/);
});

test('non-integer and out-of-range quantities are rejected', () => {
  assert.equal(priceOrderItems(catalogue, [{ slug: 'tee-shirt', size: 'M', quantity: 1.5 }]).ok, false);
  assert.equal(priceOrderItems(catalogue, [{ slug: 'tee-shirt', size: 'M', quantity: 0 }]).ok, false);
  assert.equal(priceOrderItems(catalogue, [{ slug: 'tee-shirt', size: 'M', quantity: 51 }]).ok, false);
});

test('empty order is rejected', () => {
  assert.equal(priceOrderItems(catalogue, []).ok, false);
});

test('applied option detail is stored on the item', () => {
  const r = priceOrderItems(catalogue, [{ slug: 'hoody', size: 'XL', quantity: 1, options: { Style: 'zipped', Fabric: 'fleece' } }]);
  assert.equal(r.ok, true);
  const applied = r.items[0].applied_options;
  assert.equal(applied.length, 2);
  assert.equal(r.items[0].base_price, 52);
  assert.equal(r.items[0].price, 54);
});

test('size must be present in the live product size list', () => {
  const missing = priceOrderItems(catalogue, [{ slug: 'tee-shirt', quantity: 1 }]);
  const invalid = priceOrderItems(catalogue, [{ slug: 'tee-shirt', size: '7XL', quantity: 1 }]);
  assert.equal(missing.ok, false);
  assert.match(missing.error, /size/i);
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /size/i);
});

test('surname and two distinct number preferences are normalised and accepted', () => {
  const r = validatePersonalisation({
    custom_name: "  O'Neill-Smith  ",
    custom_number: 7,
    alternate_number: 23,
    personalisation_confirmed: true,
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, {
    custom_name: "O'NEILL-SMITH",
    custom_number: 7,
    alternate_number: 23,
    number_request_status: 'subject_to_availability',
    personalisation_confirmed: true,
  });
});

test('number preferences are 1-99, ordered and distinct', () => {
  assert.equal(validatePersonalisation({ custom_number: 0, personalisation_confirmed: true }).ok, false);
  assert.equal(validatePersonalisation({ custom_number: 100, personalisation_confirmed: true }).ok, false);
  assert.equal(validatePersonalisation({ custom_number: '1e1', personalisation_confirmed: true }).ok, false);
  assert.equal(validatePersonalisation({ custom_number: '7.5', personalisation_confirmed: true }).ok, false);
  assert.equal(validatePersonalisation({ alternate_number: 9, personalisation_confirmed: true }).ok, false);
  assert.equal(validatePersonalisation({ custom_number: 9, alternate_number: 9, personalisation_confirmed: true }).ok, false);
});

test('personalisation requires explicit subject-to-availability confirmation', () => {
  const r = validatePersonalisation({ custom_name: 'SMITH', custom_number: 7 });
  assert.equal(r.ok, false);
  assert.match(r.error, /confirm/i);
});

test('surname-only personalisation is not tagged as a number request', () => {
  const r = validatePersonalisation({ custom_name: 'Smith', personalisation_confirmed: true });
  assert.equal(r.ok, true);
  assert.equal(r.value.custom_name, 'SMITH');
  assert.equal(r.value.number_request_status, undefined);
});

test('surname rejects digits and nickname punctuation', () => {
  assert.equal(validatePersonalisation({ custom_name: 'SM1TH', personalisation_confirmed: true }).ok, false);
  assert.equal(validatePersonalisation({ custom_name: 'SMITH #1', personalisation_confirmed: true }).ok, false);
});

test('personalisation fields are rejected for non-customisable products', () => {
  const r = priceOrderItems(catalogue, [{
    slug: 'tee-shirt', size: 'M', quantity: 1,
    custom_name: 'SMITH', custom_number: 7, alternate_number: 23,
    personalisation_confirmed: true,
  }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /personalisation/i);
});

test('valid personalisation is server-normalised for customisable products', () => {
  const personalisedCatalogue = [{
    id: '3', slug: 'playing-shirt', name: 'Playing Shirt', price: 45,
    active: true, sizes: ['M'], customisable: true, options: [],
  }];
  const r = priceOrderItems(personalisedCatalogue, [{
    slug: 'playing-shirt', size: 'M', quantity: 1,
    custom_name: ' smith ', custom_number: 7, alternate_number: 23,
    personalisation_confirmed: true,
  }]);
  assert.equal(r.ok, true);
  assert.equal(r.items[0].custom_name, 'SMITH');
  assert.equal(r.items[0].custom_number, 7);
  assert.equal(r.items[0].alternate_number, 23);
  assert.equal(r.items[0].number_request_status, 'subject_to_availability');
});

console.log(`\ntest-apparel-pricing: ${passed} tests passed`);
