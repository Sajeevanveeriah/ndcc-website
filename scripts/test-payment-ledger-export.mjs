#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toCsv } from '../lib/csv.ts';
import {
  buildPaymentLedgerExportRows,
  paymentLedgerFilename,
  PAYMENT_LEDGER_EXPORT_HEADER,
} from '../lib/payments/ledger-export.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

const order = {
  id: 'order-1',
  payment_reference: 'LEGACY-ORDER-REFERENCE',
  order_category: 'merch',
  customer_name: '=HYPERLINK("https://attacker.example")',
  customer_email: 'member@example.com',
  customer_phone: '+61 400 000 000',
  total_amount: '120',
  amount_paid: 80,
  balance_due: '40.00',
  payment_status: 'part_paid',
  created_at: '2026-08-29T23:00:00.000Z',
};

const payments = [
  {
    id: 'payment-1',
    order_id: order.id,
    payment_reference: 'NDCCMER-2026-000041',
    amount: '50',
    currency: 'AUD',
    method: 'stripe',
    provider: 'stripe',
    provider_reference: 'cs_test_123',
    provider_event_id: 'evt_test_123',
    status: 'settled',
    received_at: '2026-08-30T00:05:00.000Z',
    recorded_by: 'stripe-webhook',
    notes: 'First payment',
    source_transaction_id: null,
    reverses_payment_id: null,
    created_at: '2026-08-30T00:04:00.000Z',
    order,
  },
  {
    id: 'payment-2',
    order_id: order.id,
    payment_reference: 'NDCCMER-2026-000042',
    amount: 30,
    currency: 'AUD',
    method: 'bank_transfer',
    provider: 'bank_import',
    provider_reference: 'imported_transaction:tx-1',
    provider_event_id: null,
    status: 'settled',
    received_at: '2026-08-30T01:00:00.000Z',
    recorded_by: 'committee@example.com',
    notes: 'Second payment',
    source_transaction_id: 'tx-1',
    reverses_payment_id: null,
    created_at: '2026-08-30T01:01:00.000Z',
    order: [order],
  },
];

test('exports one row per payment ledger entry, not one row per order', () => {
  const rows = buildPaymentLedgerExportRows(payments);
  assert.deepEqual(rows[0], [...PAYMENT_LEDGER_EXPORT_HEADER]);
  assert.equal(rows.length, 3);
  assert.equal(rows[1][PAYMENT_LEDGER_EXPORT_HEADER.indexOf('payment_id')], 'payment-1');
  assert.equal(rows[2][PAYMENT_LEDGER_EXPORT_HEADER.indexOf('payment_id')], 'payment-2');
});

test('uses each payment reference as the unique item number', () => {
  const rows = buildPaymentLedgerExportRows(payments);
  const first = Object.fromEntries(PAYMENT_LEDGER_EXPORT_HEADER.map((key, index) => [key, rows[1][index]]));
  const second = Object.fromEntries(PAYMENT_LEDGER_EXPORT_HEADER.map((key, index) => [key, rows[2][index]]));
  assert.equal(first.item_number, 'NDCCMER-2026-000041');
  assert.equal(first.payment_reference, first.item_number);
  assert.equal(second.item_number, 'NDCCMER-2026-000042');
  assert.notEqual(first.item_number, second.item_number);
});

test('joins the order, customer and category fields without replacing the item number', () => {
  const rows = buildPaymentLedgerExportRows(payments);
  const first = Object.fromEntries(PAYMENT_LEDGER_EXPORT_HEADER.map((key, index) => [key, rows[1][index]]));
  assert.equal(first.order_id, 'order-1');
  assert.equal(first.order_reference, 'LEGACY-ORDER-REFERENCE');
  assert.equal(first.order_category, 'merch');
  assert.equal(first.customer_email, 'member@example.com');
  assert.equal(first.order_total_aud, '120.00');
  assert.equal(first.order_amount_paid_aud, '80.00');
  assert.equal(first.order_balance_due_aud, '40.00');
  assert.ok(PAYMENT_LEDGER_EXPORT_HEADER.includes('client_operation_id'));
});

test('historic payments without a canonical reference stay blank', () => {
  const rows = buildPaymentLedgerExportRows([{ ...payments[0], id: 'historic', payment_reference: null }]);
  const historic = Object.fromEntries(PAYMENT_LEDGER_EXPORT_HEADER.map((key, index) => [key, rows[1][index]]));
  assert.equal(historic.item_number, '');
  assert.equal(historic.payment_reference, '');
  assert.equal(historic.order_reference, 'LEGACY-ORDER-REFERENCE');
});

test('filename follows the dated NDCC revision format in Melbourne time', () => {
  assert.equal(
    paymentLedgerFilename(new Date('2026-08-30T14:30:00.000Z')),
    '20260831-NDCC-Payment-Ledger-Rev01.csv',
  );
});

test('full CSV protects customer fields from spreadsheet formula injection', () => {
  const csv = toCsv(buildPaymentLedgerExportRows(payments));
  assert.ok(csv.startsWith('﻿item_number,payment_reference'));
  assert.ok(csv.includes(`'=HYPERLINK`));
  assert.ok(!csv.includes(',=HYPERLINK'));
  assert.ok(csv.includes(`'+61 400 000 000`));
});

test('route is POST-only, ledger-based, joined, paginated and non-cacheable', () => {
  const route = readFileSync(path.join(repoRoot, 'app/api/admin/payments/export/route.ts'), 'utf8');
  assert.match(route, /export async function POST\(\)/);
  assert.doesNotMatch(route, /export async function GET\(\)/);
  assert.match(route, /\.from\(['"]order_payments['"]\)/);
  assert.match(route, /order:orders!order_payments_order_id_fkey/);
  assert.match(route, /payment_reference/);
  assert.match(route, /client_operation_id/);
  assert.match(route, /\.lte\(['"]created_at['"], exportCutoff\)/);
  assert.match(route, /\.range\(offset, offset \+ EXPORT_BATCH_SIZE - 1\)/);
  assert.match(route, /['"]Cache-Control['"]:\s*['"]no-store['"]/);
});

test('admin UI performs a CSRF-safe POST and downloads the CSV blob', () => {
  const page = readFileSync(path.join(repoRoot, 'app/admin/payments/page.tsx'), 'utf8');
  assert.match(page, /fetch\(['"]\/api\/admin\/payments\/export['"][\s\S]*?method:\s*['"]POST['"]/);
  assert.match(page, /['"]X-NDCC-CSRF['"]:\s*['"]1['"]/);
  assert.match(page, /response\.blob\(\)/);
  assert.match(page, /URL\.createObjectURL\(csv\)/);
  assert.match(page, /\|\| paymentLedgerFilename\(\)/);
  assert.doesNotMatch(page, /<a href=['"]\/api\/admin\/payments\/export['"]/);
});

test('test is wired into package scripts and PR validation', () => {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const workflow = readFileSync(path.join(repoRoot, '.github/workflows/pr-validation.yml'), 'utf8');
  assert.match(packageJson.scripts['test:payment-ledger-export'], /test-payment-ledger-export\.mjs/);
  assert.match(workflow, /npm run test:payment-ledger-export/);
});

console.log(`Payment ledger export tests passed (${passed} checks).`);
