#!/usr/bin/env node
// Unit tests for the merchandise order CSV export (lib/csv.ts and
// lib/orders/export.ts) using synthetic data only.

import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = mkdtempSync(path.join(tmpdir(), 'ndcc-export-'));
writeFileSync(path.join(stage, 'csv.ts'), readFileSync(path.join(repoRoot, 'lib/csv.ts'), 'utf8'));
writeFileSync(path.join(stage, 'export.ts'), readFileSync(path.join(repoRoot, 'lib/orders/export.ts'), 'utf8'));
writeFileSync(path.join(stage, 'supplier-export.ts'), readFileSync(path.join(repoRoot, 'lib/orders/supplier-export.ts'), 'utf8'));
writeFileSync(path.join(stage, 'apparel-workbook.ts'), readFileSync(path.join(repoRoot, 'lib/orders/apparel-workbook.ts'), 'utf8'));

const { csvCell, toCsv, guardFormulaInjection } = await import(pathToFileURL(path.join(stage, 'csv.ts')).href);
const { buildMerchExportRows, EXPORT_HEADER } = await import(pathToFileURL(path.join(stage, 'export.ts')).href);
const { buildSupplierExportRows, SUPPLIER_EXPORT_HEADER } = await import(pathToFileURL(path.join(stage, 'supplier-export.ts')).href);
const { buildApparelWorkbook, buildApparelDetailRows, buildApparelSummaryRows } = await import(pathToFileURL(path.join(stage, 'apparel-workbook.ts')).href);

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`  ok - ${name}`); }

// --- csv encoding ---------------------------------------------------------

test('commas are quoted', () => {
  assert.equal(csvCell('Smith, Jane'), '"Smith, Jane"');
});

test('quotes are doubled and wrapped', () => {
  assert.equal(csvCell('the "Dinos" club'), '"the ""Dinos"" club"');
});

test('line breaks are quoted', () => {
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
  assert.equal(csvCell('line1\r\nline2'), '"line1\r\nline2"');
});

test('unicode names survive untouched', () => {
  assert.equal(csvCell('Zoë Nguyễn–Ó Súilleabháin 山田'), 'Zoë Nguyễn–Ó Súilleabháin 山田');
});

test('empty and nullish values become empty cells', () => {
  assert.equal(csvCell(''), '');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
});

test('formula injection payloads are neutralised (= + - @)', () => {
  assert.equal(guardFormulaInjection('=HYPERLINK("http://evil")'), `'=HYPERLINK("http://evil")`);
  assert.equal(csvCell('=1+2'), `'=1+2`);
  assert.equal(csvCell('+61 400 000 000'), `'+61 400 000 000`);
  assert.equal(csvCell('-2+3'), `'-2+3`);
  assert.equal(csvCell('@SUM(A1)'), `'@SUM(A1)`);
  assert.ok(csvCell('\t=cmd').startsWith(`'`));
});

test('toCsv emits BOM + CRLF rows', () => {
  const out = toCsv([['a', 'b'], ['1', '2']]);
  assert.ok(out.startsWith('﻿'));
  assert.ok(out.includes('a,b\r\n1,2\r\n'));
});

// --- export rows -----------------------------------------------------------

const orders = [
  {
    id: 'order-1',
    created_at: '2026-07-10T02:00:00Z',
    payment_reference: 'NDCC-20260710-1234',
    merch_window_label: 'Season Launch',
    merch_window_id: 'win-1',
    customer_name: 'Jane "JJ" Smith, Jr.',
    customer_email: 'jane@example.com',
    customer_phone: '+61 400 111 222',
    items: [
      {
        slug: 'tee-shirt', name: 'Tee Shirt', size: 'One Size', quantity: 2,
        price: 34, base_price: 33,
        applied_options: [{ group: 'Sleeve length', value: 'long-sleeve', label: 'Long sleeve', price_delta: 1 }],
      },
      {
        slug: 'playing-shirt', name: 'Playing Shirt', size: 'One Size', quantity: 1,
        price: 36, base_price: 36, custom_name: 'SMITH', custom_number: 7,
        alternate_number: 23, number_request_status: 'subject_to_availability',
      },
    ],
    total_amount: 104,
    amount_paid: 40,
    balance_due: 64,
    payment_status: 'part_paid',
    processed: false,
    notes: 'Pickup Thursday\nafter training',
  },
  {
    id: 'order-2',
    created_at: '2026-07-12T05:00:00Z',
    payment_reference: 'NDCC-20260712-9999',
    merch_window_label: 'Season Launch',
    merch_window_id: 'win-1',
    customer_name: '=HYPERLINK("http://evil.example")',
    customer_email: 'evil@example.com',
    customer_phone: '',
    items: [{ slug: 'hoody', name: 'Hoody', size: 'One Size', quantity: 1, price: 52, base_price: 52 }],
    total_amount: 52,
    amount_paid: 52,
    balance_due: 0,
    payment_status: 'paid',
    processed: true,
    notes: '',
  },
];

const payments = [
  { order_id: 'order-1', method: 'bank_transfer', status: 'settled', provider_reference: null },
  { order_id: 'order-2', method: 'stripe', status: 'settled', provider_reference: 'cs_test_abc' },
  { order_id: 'order-2', method: 'cash', status: 'void', provider_reference: null },
];

test('one row per order item with the full column set', () => {
  const rows = buildMerchExportRows(orders, payments);
  assert.deepEqual(rows[0], EXPORT_HEADER);
  assert.equal(rows.length, 1 + 3);
  const first = Object.fromEntries(EXPORT_HEADER.map((h, i) => [h, rows[1][i]]));
  assert.equal(first.order_reference, 'NDCC-20260710-1234');
  assert.equal(first.product, 'Tee Shirt');
  assert.equal(first.selected_options, 'Sleeve length: Long sleeve (+$1.00)');
  assert.equal(first.unit_base_price, '33.00');
  assert.equal(first.option_surcharges, '1.00');
  assert.equal(first.final_unit_price, '34.00');
  assert.equal(first.line_total, '68.00');
  assert.equal(first.order_total, '104.00');
  assert.equal(first.amount_paid, '40.00');
  assert.equal(first.balance_due, '64.00');
  assert.equal(first.payment_status, 'part_paid');
  assert.equal(first.payment_methods, 'bank_transfer');
  assert.equal(first.order_processed, 'no');
});

test('ISO and Melbourne timestamps both present', () => {
  const rows = buildMerchExportRows(orders, payments);
  const first = Object.fromEntries(EXPORT_HEADER.map((h, i) => [h, rows[1][i]]));
  assert.equal(first.order_date_iso, '2026-07-10T02:00:00.000Z');
  assert.match(String(first.order_date_melbourne), /10\/07\/2026/);
});

test('surname, two number preferences and availability status are exported', () => {
  const rows = buildMerchExportRows(orders, payments);
  const second = Object.fromEntries(EXPORT_HEADER.map((h, i) => [h, rows[2][i]]));
  assert.equal(second.custom_name, 'SMITH');
  assert.equal(second.custom_number, '7');
  assert.equal(second.alternate_number, '23');
  assert.equal(second.number_request_status, 'subject_to_availability');
  const third = Object.fromEntries(EXPORT_HEADER.map((h, i) => [h, rows[3][i]]));
  assert.equal(third.custom_name, '');
  assert.equal(third.custom_number, '');
  assert.equal(third.alternate_number, '');
  assert.equal(third.number_request_status, '');
});

test('void payments excluded from methods; provider references included', () => {
  const rows = buildMerchExportRows(orders, payments);
  const third = Object.fromEntries(EXPORT_HEADER.map((h, i) => [h, rows[3][i]]));
  assert.equal(third.payment_methods, 'stripe');
  assert.equal(third.payment_references, 'NDCC-20260712-9999; cs_test_abc');
});

test('full CSV neutralises the hostile customer name', () => {
  const csv = toCsv(buildMerchExportRows(orders, payments));
  assert.ok(csv.includes(`'=HYPERLINK`));
  assert.ok(!csv.includes(`,=HYPERLINK`));
});

test('multi-line note is safely quoted in final CSV', () => {
  const csv = toCsv(buildMerchExportRows(orders, payments));
  assert.ok(csv.includes('"Pickup Thursday\nafter training"'));
});

test('filter: paid in full only', () => {
  const rows = buildMerchExportRows(orders, payments, { paidInFullOnly: true });
  assert.equal(rows.length, 2);
  assert.equal(rows[1][EXPORT_HEADER.indexOf('payment_status')], 'paid');
});

test('filter: exclude part-paid orders', () => {
  const rows = buildMerchExportRows(orders, payments, { includePartPaid: false });
  assert.equal(rows.length, 2);
});

test('filter: product substring', () => {
  const rows = buildMerchExportRows(orders, payments, { product: 'tee' });
  assert.equal(rows.length, 2);
  assert.equal(rows[1][EXPORT_HEADER.indexOf('product')], 'Tee Shirt');
});

test('filter: date range', () => {
  const rows = buildMerchExportRows(orders, payments, { dateFrom: '2026-07-11T00:00:00Z' });
  assert.equal(rows.length, 2);
  assert.equal(rows[1][EXPORT_HEADER.indexOf('order_reference')], 'NDCC-20260712-9999');
});

test('filter: window and processed', () => {
  assert.equal(buildMerchExportRows(orders, payments, { windowId: 'win-2' }).length, 1);
  assert.equal(buildMerchExportRows(orders, payments, { processed: 'true' }).length, 2);
});

test('filter: unpaid alias matches legacy pending_bank_transfer', () => {
  const legacy = [{ ...orders[0], id: 'order-3', payment_status: 'pending_bank_transfer' }];
  const rows = buildMerchExportRows(legacy, [], { paymentStatus: 'unpaid' });
  assert.equal(rows.length, 3); // header + two items
});

test('supplier export includes options, surname, two preferences and request status', () => {
  const rows = buildSupplierExportRows(orders);
  assert.deepEqual(rows[0], SUPPLIER_EXPORT_HEADER);
  assert.deepEqual(rows[0].slice(0, 7), [
    'customer', 'product', 'size', 'quantity', 'order_date', 'window_label', 'status',
  ]);
  const personalised = Object.fromEntries(SUPPLIER_EXPORT_HEADER.map((h, i) => [h, rows[2][i]]));
  assert.equal(personalised.product, 'Playing Shirt');
  assert.equal(personalised.surname, 'SMITH');
  assert.equal(personalised.first_number_preference, '7');
  assert.equal(personalised.second_number_preference, '23');
  assert.equal(personalised.number_request_status, 'subject_to_availability');
});

test('apparel workbook matches the four-sheet supplier structure', () => {
  const workbook = buildApparelWorkbook(orders);
  assert.equal(workbook.subarray(0, 2).toString(), 'PK');
  const source = workbook.toString('utf8');
  for (const sheetName of ['Master', 'Custom bags', '2627 - Order 1', '2627 - Order 1 Summary']) {
    assert.ok(source.includes(`name="${sheetName}"`), `missing sheet ${sheetName}`);
  }
  assert.ok(source.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'));
});

test('apparel detail rows use supplier names, sizes and number preferences', () => {
  const detail = buildApparelDetailRows(orders);
  assert.deepEqual(detail[0], [
    'Name', 'Item', 'Size', 'Shirt name', 'Shirt number',
    'Invoiced?', 'Paid?', 'Ready for distribution',
  ]);
  assert.equal(detail[1][1], 'Training - LS tee');
  assert.equal(detail[1][2], 'One size');
  assert.equal(detail[3][1], 'Maroon playing - SS shirt');
  assert.equal(detail[3][3], 'SMITH');
  assert.equal(detail[3][4], '7 / 23');
});

test('apparel summary is limited to and reconciles the current export rows', () => {
  const detail = buildApparelDetailRows(orders.slice(0, 1));
  const summary = buildApparelSummaryRows(detail);
  const totalRow = summary.at(-1);
  assert.equal(totalRow?.[0], 'Grand Total');
  assert.equal(totalRow?.at(-1), 3);
  assert.ok(!summary.some((row) => row[0] === 'Hoodie - standard'));
});

console.log(`\ntest-merch-export: ${passed} tests passed`);
