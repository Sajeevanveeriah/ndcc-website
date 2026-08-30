#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = await import(pathToFileURL(path.join(repoRoot, 'lib/order-notification-content.ts')).href);

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

const apparelInput = {
  orderId: '11111111-1111-4111-8111-111111111111',
  paymentReference: 'NDCC-ABC123',
  category: 'apparel',
  stage: 'created',
  paymentMade: false,
  customer: {
    name: 'Ava <script>alert(1)</script>',
    email: 'ava@example.com',
    phone: '0400 000 000',
  },
  items: [
    {
      name: 'Playing Shirt <Home>',
      size: 'L',
      quantity: 2,
      price: 45,
      applied_options: [{ group: 'Sleeve', label: 'Long' }],
      custom_name: 'O\'CONNOR',
      custom_number: 17,
      alternate_number: 27,
    },
  ],
  totalAmount: 90,
};

console.log('Checks:');

test('apparel routes to secretary and Josh in the required order', () => {
  assert.deepEqual(content.getStaffOrderRecipients('apparel'), [
    'ndcc.secretary1@gmail.com',
    'joshwalker20695@gmail.com',
  ]);
});

test('kitchen routes to the secretary and treasurer', () => {
  assert.deepEqual(content.getStaffOrderRecipients('kitchen'), [
    'ndcc.secretary1@gmail.com',
    'ndcc.treasurer1@gmail.com',
  ]);
});

test('new apparel order shows only the binary unpaid state', () => {
  const built = content.buildStaffOrderNotificationContent(apparelInput);
  assert.equal(built.paymentMadeLabel, 'No');
  assert.match(built.subject, /Payment made: No/);
  assert.match(built.bodyHtml, />Payment made<\/td><td[^>]*>No<\/td>/);
  assert.doesNotMatch(built.bodyHtml, /pending_bank_transfer|part_paid|amount_paid|balance_due/i);
});

test('paid follow-up shows the binary paid state and a distinct key', () => {
  const created = content.buildStaffOrderNotificationContent(apparelInput);
  const paid = content.buildStaffOrderNotificationContent({
    ...apparelInput,
    stage: 'paid',
    paymentMade: true,
  });
  assert.equal(paid.paymentMadeLabel, 'Yes');
  assert.match(paid.subject, /Payment made: Yes/);
  assert.match(paid.bodyHtml, />Payment made<\/td><td[^>]*>Yes<\/td>/);
  assert.notEqual(created.idempotencyKey, paid.idempotencyKey);
});

test('paid follow-up distinguishes payment, order and bank references', () => {
  const paid = content.buildStaffOrderNotificationContent({
    ...apparelInput,
    stage: 'paid',
    paymentMade: true,
    paymentReference: 'NDCCMER-2026-000042',
    orderReference: 'NDCCMER-2026-ORDER01',
    bankReference: 'BANK-TRACE-42',
  });
  assert.match(paid.subject, /NDCCMER-2026-000042/);
  assert.match(paid.bodyHtml, />Payment reference<\/td><td[^>]*>NDCCMER-2026-000042<\/td>/);
  assert.match(paid.bodyHtml, />Order \/ bank reference<\/td><td[^>]*>NDCCMER-2026-ORDER01<\/td>/);
  assert.match(paid.bodyHtml, />Bank statement reference<\/td><td[^>]*>BANK-TRACE-42<\/td>/);
});

test('customer and item content is HTML escaped', () => {
  const built = content.buildStaffOrderNotificationContent(apparelInput);
  assert.doesNotMatch(built.bodyHtml, /<script>/);
  assert.match(built.bodyHtml, /Ava &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(built.bodyHtml, /Playing Shirt &lt;Home&gt;/);
  assert.match(built.bodyHtml, /O&#39;CONNOR/);
});

test('apparel detail includes options, size, surname and number preferences', () => {
  const built = content.buildStaffOrderNotificationContent(apparelInput);
  assert.match(built.bodyHtml, /Size: L/);
  assert.match(built.bodyHtml, /Sleeve: Long/);
  assert.match(built.bodyHtml, /Surname: O&#39;CONNOR/);
  assert.match(built.bodyHtml, /Number preferences: 17, 27/);
  assert.match(built.bodyHtml, /\$90\.00 AUD/);
});

test('idempotency key is stable for the same order and stage', () => {
  const first = content.buildStaffOrderNotificationContent(apparelInput);
  const second = content.buildStaffOrderNotificationContent(apparelInput);
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.equal(first.idempotencyKey, `staff-order-created-${apparelInput.orderId}`);
});

const emailSource = readFileSync(path.join(repoRoot, 'lib/email.ts'), 'utf8');
const serverSource = readFileSync(path.join(repoRoot, 'lib/order-notifications.ts'), 'utf8');
const apparelRoute = readFileSync(path.join(repoRoot, 'app/api/orders/route.ts'), 'utf8');
const kitchenRoute = readFileSync(path.join(repoRoot, 'app/api/kitchen/orders/route.ts'), 'utf8');
const webhookRoute = readFileSync(path.join(repoRoot, 'app/api/stripe/webhook/route.ts'), 'utf8');
const adminPaymentsRoute = readFileSync(path.join(repoRoot, 'app/api/admin/orders/payments/route.ts'), 'utf8');

function exposesInternalPaymentStatus(source) {
  return /Payment made[^\n]*(pending_bank_transfer|part_paid|payment_status|amount_paid|balance_due)/i.test(source);
}

test('known-defective payment wording detector catches internal status leakage', () => {
  assert.equal(exposesInternalPaymentStatus('Payment made: pending_bank_transfer'), true);
});

test('email wrapper forwards a Resend idempotency key', () => {
  assert.match(emailSource, /idempotencyKey\?: string/);
  assert.match(emailSource, /emails\.send\(email, sendOptions\)/);
});

test('server notification reader uses canonical order data', () => {
  assert.match(serverSource, /from\('orders'\)/);
  assert.match(serverSource, /order\.payment_status !== 'paid'/);
  assert.match(serverSource, /sendPaidStaffOrderNotificationForPayment/);
  assert.match(serverSource, /staff_paid_notification_sent_at/);
});

test('apparel creation route awaits a created notification', () => {
  assert.match(apparelRoute, /sendStaffOrderNotificationForOrder\(supabase, data\.id, 'created'\)/);
});

test('kitchen creation route awaits a created notification', () => {
  assert.match(kitchenRoute, /sendStaffOrderNotificationForOrder\(supabase, linkedOrder\.id, 'created'\)/);
});

test('Stripe settlement and duplicate paths dispatch best-effort through the paid marker', () => {
  assert.match(webhookRoute, /sendPaidStaffOrderNotificationForPayment/);
  assert.match(webhookRoute, /rpc\('settle_stripe_order_payment'/);
  assert.match(webhookRoute, /duplicate:\s*settlement\.duplicate === true/);
  assert.match(webhookRoute, /bestEffortPaidStaffNotice/);
  assert.match(webhookRoute, /finishOrderSettlement/);
  assert.doesNotMatch(webhookRoute, /Paid order notification failed[^\n]*status:\s*500/);
});

test('manual full-payment route dispatches the paid follow-up', () => {
  assert.match(adminPaymentsRoute, /updatedOrder\?\.payment_status === 'paid'/);
  assert.match(adminPaymentsRoute, /sendPaidStaffOrderNotificationForPayment/);
});

test('staff notification templates do not expose internal payment states', () => {
  const combined = `${readFileSync(path.join(repoRoot, 'lib/order-notification-content.ts'), 'utf8')}\n${serverSource}`;
  assert.equal(exposesInternalPaymentStatus(combined), false);
});

console.log(`\ntest-order-notifications: ${passed} tests passed`);
