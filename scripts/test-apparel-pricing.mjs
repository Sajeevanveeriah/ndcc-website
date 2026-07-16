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
const catalogueSrc = readFileSync(path.join(repoRoot, 'lib/apparel/server-catalogue.ts'), 'utf8')
  .replace("@/lib/apparel/pricing", './pricing.ts');
writeFileSync(path.join(stage, 'server-catalogue.ts'), catalogueSrc);

const { computeUnitPrice } = await import(pathToFileURL(path.join(stage, 'pricing.ts')).href);
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
  options: [
    option('Sleeve length', 'short-sleeve', 'Short sleeve', 0, true, 1),
    option('Sleeve length', 'long-sleeve', 'Long sleeve', 1, false, 2),
  ],
};

const hoody = {
  slug: 'hoody', name: 'Hoody', price: 52,
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
    { slug: 'tee-shirt', quantity: 2, price: 0.01, options: { 'Sleeve length': 'long-sleeve' } },
    { slug: 'hoody', quantity: 1, options: { Style: 'zipped' } },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.totalAmount, 34 * 2 + 53);
  assert.equal(r.items[0].price, 34);
  assert.equal(r.clientPriceMismatches.length, 1);
});

test('unknown product is rejected outright', () => {
  const r = priceOrderItems(catalogue, [{ slug: 'not-a-product', quantity: 1 }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /Unknown product/);
});

test('non-integer and out-of-range quantities are rejected', () => {
  assert.equal(priceOrderItems(catalogue, [{ slug: 'tee-shirt', quantity: 1.5 }]).ok, false);
  assert.equal(priceOrderItems(catalogue, [{ slug: 'tee-shirt', quantity: 0 }]).ok, false);
  assert.equal(priceOrderItems(catalogue, [{ slug: 'tee-shirt', quantity: 51 }]).ok, false);
});

test('empty order is rejected', () => {
  assert.equal(priceOrderItems(catalogue, []).ok, false);
});

test('applied option detail is stored on the item', () => {
  const r = priceOrderItems(catalogue, [{ slug: 'hoody', quantity: 1, options: { Style: 'zipped', Fabric: 'fleece' } }]);
  assert.equal(r.ok, true);
  const applied = r.items[0].applied_options;
  assert.equal(applied.length, 2);
  assert.equal(r.items[0].base_price, 52);
  assert.equal(r.items[0].price, 54);
});

console.log(`\ntest-apparel-pricing: ${passed} tests passed`);
