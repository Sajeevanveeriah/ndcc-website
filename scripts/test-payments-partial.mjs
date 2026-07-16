#!/usr/bin/env node
// Unit tests for lib/payments/partial.ts — validation of customer payment
// requests (full and partial) before any Stripe session is created.

import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = mkdtempSync(path.join(tmpdir(), 'ndcc-partial-'));
writeFileSync(path.join(stage, 'pricing.ts'), readFileSync(path.join(repoRoot, 'lib/apparel/pricing.ts'), 'utf8'));
writeFileSync(
  path.join(stage, 'partial.ts'),
  readFileSync(path.join(repoRoot, 'lib/payments/partial.ts'), 'utf8').replace("@/lib/apparel/pricing", './pricing.ts')
);
const { validatePaymentRequest } = await import(pathToFileURL(path.join(stage, 'partial.ts')).href);

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`  ok - ${name}`); }

const base = {
  balanceDue: 100,
  minimumPartialAmount: 10,
  partialPaymentsEnabled: true,
  orderStatus: 'submitted',
  paymentStatus: 'unpaid',
};

test('no amount -> full balance', () => {
  const r = validatePaymentRequest({ ...base, requestedAmount: null });
  assert.deepEqual(r, { ok: true, amountCents: 10000, isPartial: false });
});

test('valid part payment', () => {
  const r = validatePaymentRequest({ ...base, requestedAmount: 40 });
  assert.deepEqual(r, { ok: true, amountCents: 4000, isPartial: true });
});

test('part payment below minimum rejected', () => {
  const r = validatePaymentRequest({ ...base, requestedAmount: 5 });
  assert.equal(r.ok, false);
  assert.match(r.error, /at least/);
});

test('final payment below minimum allowed when it clears the balance', () => {
  const r = validatePaymentRequest({ ...base, balanceDue: 5, requestedAmount: 5 });
  assert.deepEqual(r, { ok: true, amountCents: 500, isPartial: false });
});

test('amount above balance rejected (no overpayment via checkout)', () => {
  const r = validatePaymentRequest({ ...base, requestedAmount: 100.01 });
  assert.equal(r.ok, false);
  assert.match(r.error, /exceed/);
});

test('zero and negative amounts rejected', () => {
  assert.equal(validatePaymentRequest({ ...base, requestedAmount: 0 }).ok, false);
  assert.equal(validatePaymentRequest({ ...base, requestedAmount: -10 }).ok, false);
});

test('NaN amount rejected', () => {
  assert.equal(validatePaymentRequest({ ...base, requestedAmount: Number('abc') }).ok, false);
});

test('part payment rejected when partial payments disabled', () => {
  const r = validatePaymentRequest({ ...base, partialPaymentsEnabled: false, requestedAmount: 40 });
  assert.equal(r.ok, false);
  assert.match(r.error, /not currently enabled/);
});

test('full payment still allowed when partial payments disabled', () => {
  const r = validatePaymentRequest({ ...base, partialPaymentsEnabled: false, requestedAmount: 100 });
  assert.deepEqual(r, { ok: true, amountCents: 10000, isPartial: false });
});

test('payment after cancellation rejected', () => {
  const r = validatePaymentRequest({ ...base, orderStatus: 'cancelled', requestedAmount: 40 });
  assert.equal(r.ok, false);
  assert.match(r.error, /cancelled/);
});

test('payment on fully paid order rejected', () => {
  const r = validatePaymentRequest({ ...base, balanceDue: 0, requestedAmount: null });
  assert.equal(r.ok, false);
  assert.match(r.error, /already fully paid/);
});

test('payment on needs_review order rejected', () => {
  const r = validatePaymentRequest({ ...base, paymentStatus: 'needs_review', requestedAmount: 40 });
  assert.equal(r.ok, false);
  assert.match(r.error, /review/);
});

test('float-safe: 33.33 remaining of 99.99', () => {
  const r = validatePaymentRequest({ ...base, balanceDue: 33.33, requestedAmount: 33.33 });
  assert.deepEqual(r, { ok: true, amountCents: 3333, isPartial: false });
});

console.log(`\ntest-payments-partial: ${passed} tests passed`);
