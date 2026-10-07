#!/usr/bin/env node
// Offline tests for the read-only receipt delivery health summary shown on
// /admin/operations (lib/payments/receipt-delivery-health.ts). No database.
//
// Run: npm run test:receipt-delivery-health

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const health = await import('../lib/payments/receipt-delivery-health.ts');

// In-memory receipt_delivery_jobs with the statuses the outbox migration allows.
const now = new Date('2026-10-07T00:00:00Z');
const jobs = [
  { id: 'q-due', status: 'queued', next_attempt_at: '2026-10-06T01:00:00Z', lease_expires_at: null, updated_at: '2026-10-06T01:00:00Z' },
  { id: 'r-due', status: 'retry', next_attempt_at: '2026-10-05T12:00:00Z', lease_expires_at: null, updated_at: '2026-10-05T12:00:00Z' },
  { id: 'r-later', status: 'retry', next_attempt_at: '2026-10-08T12:00:00Z', lease_expires_at: null, updated_at: '2026-10-06T12:00:00Z' },
  { id: 'dead-1', status: 'dead_letter', next_attempt_at: null, lease_expires_at: null, updated_at: '2026-10-01T00:00:00Z' },
  { id: 'dead-2', status: 'dead_letter', next_attempt_at: null, lease_expires_at: null, updated_at: '2026-10-04T00:00:00Z' },
  { id: 'stuck', status: 'processing', next_attempt_at: null, lease_expires_at: '2026-10-06T23:00:00Z', updated_at: '2026-10-06T22:55:00Z' },
  { id: 'busy', status: 'processing', next_attempt_at: null, lease_expires_at: '2026-10-07T00:04:00Z', updated_at: '2026-10-06T23:59:00Z' },
  { id: 'done', status: 'delivered', next_attempt_at: null, lease_expires_at: null, updated_at: '2026-10-06T00:00:00Z' },
];
const writes = [];
let failTable = false;
function makeDb() {
  return { from(table) {
    assert.equal(table, 'receipt_delivery_jobs');
    let head = false;
    let columns = '';
    const filters = [];
    let order = null;
    let limit = Infinity;
    const query = {
      select(cols, options) { columns = cols; head = options?.head === true; return query; },
      in(column, values) { filters.push((row) => values.includes(row[column])); return query; },
      eq(column, value) { filters.push((row) => row[column] === value); return query; },
      lte(column, value) { filters.push((row) => row[column] !== null && row[column] <= value); return query; },
      lt(column, value) { filters.push((row) => row[column] !== null && row[column] < value); return query; },
      order(column, { ascending }) { order = [column, ascending]; return query; },
      limit(value) { limit = value; return query; },
      update() { writes.push('update'); return query; },
      insert() { writes.push('insert'); return query; },
      delete() { writes.push('delete'); return query; },
      then(resolve, reject) {
        if (failTable) return Promise.resolve({ data: null, count: null, error: { message: 'down' } }).then(resolve, reject);
        let rows = jobs.filter((row) => filters.every((f) => f(row)));
        if (head) return Promise.resolve({ data: null, count: rows.length, error: null }).then(resolve, reject);
        if (order) rows = [...rows].sort((a, b) => (a[order[0]] < b[order[0]] ? -1 : 1) * (order[1] ? 1 : -1));
        return Promise.resolve({ data: rows.slice(0, limit).map((row) => ({ [columns]: row[columns] })), count: null, error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
}

let result = await health.loadReceiptDeliveryHealth(makeDb(), now);
assert.deepEqual(result, {
  due: 2,
  retrying: 2,
  deadLetter: 2,
  staleLeases: 1,
  oldestDueAt: '2026-10-05T12:00:00Z',
  latestDeadLetterAt: '2026-10-04T00:00:00Z',
  cronSchedule: '05:10 UTC daily',
  needsAttention: true,
});
assert.equal(writes.length, 0, 'the health summary is read-only');
console.log('PASS receipt delivery health counts due, retrying, dead-letter and stale-lease jobs read-only');

assert.equal(health.summariseReceiptDeliveryHealth({ due: 0, retrying: 3, deadLetter: 0, staleLeases: 0, oldestDueAt: null, latestDeadLetterAt: null }).needsAttention, false, 'future retries alone are not an alert');
assert.equal(health.summariseReceiptDeliveryHealth({ due: 0, retrying: 0, deadLetter: 1, staleLeases: 0, oldestDueAt: null, latestDeadLetterAt: null }).needsAttention, true);
assert.equal(health.summariseReceiptDeliveryHealth({ due: 0, retrying: 0, deadLetter: 0, staleLeases: null, oldestDueAt: null, latestDeadLetterAt: null }).needsAttention, true, 'unreadable figures are surfaced, never shown as healthy');

failTable = true;
result = await health.loadReceiptDeliveryHealth(makeDb(), now);
assert.deepEqual([result.due, result.retrying, result.deadLetter, result.staleLeases, result.oldestDueAt, result.latestDeadLetterAt], [null, null, null, null, null, null]);
assert.equal(result.needsAttention, true);
console.log('PASS an unreadable outbox shows as unavailable and needing attention, never as zero');

// The cron schedule shown to admins matches vercel.json, and the cron stays
// daily (Vercel Hobby plan; see README).
const cron = JSON.parse(readFileSync('vercel.json', 'utf8')).crons.find((entry) => entry.path === '/api/cron/payment-receipts');
assert.equal(cron.schedule, '10 5 * * *');

// The admin route stays read-only on GET and restricted to full-access roles.
const route = readFileSync('app/api/admin/operations/route.ts', 'utf8');
const get = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'));
assert.match(get, /requirePermission\('dashboard', FULL_ACCESS_ROLES\)/);
assert.match(get, /loadReceiptDeliveryHealth\(supabase\)/);
assert.doesNotMatch(get, /processPaymentReceiptJobs|\.update\(|\.insert\(|\.delete\(/);
assert.match(readFileSync('app/admin/operations/page.tsx', 'utf8'), /<ReceiptDeliveryStatus value=\{health\.receiptDelivery\} \/>/);
console.log('PASS operations page shows delivery health from a full-access, read-only GET; cron schedule unchanged');
