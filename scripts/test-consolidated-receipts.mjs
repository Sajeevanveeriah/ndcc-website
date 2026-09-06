import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real sender with isolated database, PDF and email adapters.
// No credentials, network, live records or messages are used by these tests.
function moduleAt(path, dependencies = {}, suffix = '') {
  const source = ts.transpileModule(readFileSync(path, 'utf8') + suffix, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, console, Date, Set, Map, Number,
    require(name) {
      if (name === 'server-only') return {};
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}
const recipients = moduleAt('lib/payments/receipt-recipients.ts');
const references = moduleAt('lib/payments/reference.ts', { '@/lib/supabase-server': {} });
const content = moduleAt('lib/order-notification-content.ts');
const plain = value => JSON.parse(JSON.stringify(value));
assert.deepEqual(plain(recipients.receiptRecipients(' NDCC.Secretary1@gmail.com ', ['ndsc.cricket@gmail.com', 'NDCC.SECRETARY1@gmail.com'])), {
  to: 'ndcc.secretary1@gmail.com', bcc: ['ndsc.cricket@gmail.com'],
});
assert.deepEqual(plain(recipients.receiptRecipients('buyer@example.com', ['joshwalker20695@gmail.com'])).bcc,
  ['ndcc.secretary1@gmail.com', 'ndsc.cricket@gmail.com', 'joshwalker20695@gmail.com']);

let marker = {}, sent = [], pdfData, providerFails = false;
const order = {
  id: '05946ba5-9d34-4b4b-98a3-3591f0a4233b', payment_reference: 'NDCCMER-2026-000001',
  order_category: 'merch', customer_name: 'Test purchaser', customer_email: 'ndcc.secretary1@gmail.com',
  customer_phone: '0400000000', total_amount: 55, payment_status: 'paid', notes: '<script>unsafe</script>',
  items: [{ name: 'Test shirt', size: 'M', quantity: 1, price: 55, custom_name: 'TEST' }],
};
const payment = {
  id: 'test-payment', amount: 55, currency: 'AUD', status: 'settled', received_at: '2026-09-05T11:01:00Z',
  method: 'stripe', payment_reference: 'NDCCMER-2026-000002', metadata: { payment_intent: 'pi_test' },
};
const db = { from(table) { return { select() { return this; }, eq() { return this; }, limit() { return this; },
  async maybeSingle() { return { data: table === 'orders' ? order : table === 'order_payments' ? payment : null, error: null }; },
}; } };
const sender = moduleAt('lib/payment-receipts.ts', {
  '@/lib/payments/receipt-recipients': recipients,
  '@/lib/order-notification-content': content,
  '@/lib/payments/reference': references,
  '@/lib/email': { emailHtml: (_, body) => body, getTransactionalReplyTo: () => undefined,
    sendEmail: async payload => { sent.push(payload); return providerFails ? { status: 'failed', reason: 'Temporary provider failure' } : { status: 'sent', id: 'message-test' }; } },
  '@/lib/payment-metadata': { getPaymentMetadata: async () => ({ metadata: marker, error: null }),
    mergePaymentMetadata: async (_, __, value) => { marker = { ...marker, ...value }; return { ok: true }; } },
  '@/lib/payments/receipt-delivery-policy': { canRecordSimulatedReceiptDelivery: () => false },
  '@/lib/payment-receipt-pdf': { buildPaymentReceiptFilename: data => `${data.reference}.pdf`,
    buildPaymentReceiptPdf: async data => { pdfData = data; return 'pdf-test'; } },
});
assert.equal((await sender.sendOrderPaymentReceiptForPayment(db, payment.id, order.id)).status, 'sent');
assert.equal((await sender.sendOrderPaymentReceiptForPayment(db, payment.id, order.id)).status, 'already_sent');
assert.equal(sent.length, 1, 'A replay must not produce a second message');
assert.equal(pdfData.reference, order.payment_reference);
assert.ok(sent[0].subject.endsWith(order.payment_reference));
assert.ok(!sent[0].html.includes(payment.payment_reference));
assert.ok(!sent[0].html.includes('<script>'));
assert.ok(sent[0].html.includes('Surname: TEST'));
assert.deepEqual(plain(sent[0].bcc), ['ndsc.cricket@gmail.com', 'joshwalker20695@gmail.com']);
marker = {}; sent = []; payment.status = 'pending';
assert.equal((await sender.sendOrderPaymentReceiptForPayment(db, payment.id, order.id)).status, 'failed');
assert.equal(sent.length, 0, 'An unpaid order must not receive a payment receipt');
payment.status = 'settled'; order.payment_status = 'part_paid'; providerFails = true;
assert.equal((await sender.sendOrderPaymentReceiptForPayment(db, payment.id, order.id)).status, 'failed');
assert.equal(marker.customer_receipt_sent_at, undefined);
providerFails = false;
assert.equal((await sender.sendOrderPaymentReceiptForPayment(db, payment.id, order.id)).status, 'sent');
assert.equal(sent[0].idempotencyKey, sent[1].idempotencyKey);
assert.ok(sent[1].html.includes('A part payment has been received.'));
assert.ok(!sent[1].html.includes('The order is now fully paid.'));

const compatibility = moduleAt('lib/order-notifications.ts', {
  '@/lib/email': { sendEmail: () => { throw new Error('A second staff email is forbidden'); } },
  '@/lib/order-notification-content': content,
});
assert.equal((await compatibility.sendPaidStaffOrderNotificationForPayment(db, payment, order.id)).status, 'not_applicable');
console.log('Consolidated receipts: recipient deduplication, public reference parity, replay, unpaid, partial payment, provider retry and escaping passed.');

const pricing = moduleAt('lib/apparel/pricing.ts');
const partial = moduleAt('lib/payments/partial.ts', { '@/lib/apparel/pricing': pricing });
const checkoutKeys = moduleAt('lib/payments/stripe-checkout.ts');
for (const version of ['new', '1', '2']) {
  let payload, linkedMetadata, reservations = 0;
  const now = Math.floor(Date.now() / 1000);
  const checkoutOrder = { ...order, amount_paid: 0, payment_status: 'unpaid', order_status: 'open' };
  const internalReference = 'NDCCMER-2026-000009';
  const frozen = {
    payment_reference: internalReference, item_number: internalReference,
    checkout_contract_version: '1', checkout_created_at_unix: now, checkout_expires_at_unix: now + 3600,
    checkout_origin: 'https://www.ndcc.com.au', checkout_return_path: '/merchandise',
    checkout_customer_email: order.customer_email, checkout_order_reference: order.payment_reference,
    order_category: 'merch', payment_kind: 'balance', expected_amount_cents: 5500,
    ...(version === '2' ? { ndcc_reference_version: '2' } : {}),
  };
  const attempts = version === 'new' ? [] : [{ id: 'reserved', amount: 55, currency: 'AUD',
    status: 'pending', provider_reference: null, payment_reference: internalReference,
    metadata: frozen, created_at: new Date().toISOString() }];
  const checkoutDb = {
    async rpc(name) {
      assert.equal(name, 'reserve_order_stripe_payment_v2'); reservations++;
      return { data: [{ payment_id: 'reserved', checkout_expires_at_unix: now + 3600 }] };
    },
    from(table) { return {
      select() { return this; }, eq() { return this; }, is() { return this; },
      update(value) { if (table === 'order_payments') linkedMetadata = value.metadata; return this; },
      async order() { return { data: attempts }; },
      async maybeSingle() { return { data: table === 'orders' ? checkoutOrder : {
        id: 'reserved', order_id: order.id, amount: 55, payment_reference: internalReference, provider_reference: 'cs_test',
      } }; },
      then(resolve) { resolve({ error: null }); },
    }; },
  };
  const route = moduleAt('app/api/payments/checkout-session/route.ts', {
    '@/lib/club-settings': {}, 'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/lib/supabase-server': { createServerClient: () => checkoutDb, isServerSupabaseConfigured: () => true },
    '@/lib/stripe': { getStripe: () => ({ checkout: { sessions: { create: async value => {
      payload = value;
      return { ...value, id: 'cs_test', url: 'https://checkout.stripe.com/test', status: 'open', amount_total: 5500, currency: 'aud' };
    } } } }) },
    '@/lib/server/request-guards': { getClientIp: () => 'test', enforceRateLimit: () => true },
    '@/lib/payments/capabilities': { loadMerchPaymentSettings: async () => ({ minimum_partial_amount: 5 }), deriveCapabilities: () => ({ card: true, partial_payments: true }) },
    '@/lib/payments/partial': partial, '@/lib/payments/stripe-checkout': checkoutKeys,
    '@/lib/payments/reference': { ...references, generateUniquePaymentReference: async () => internalReference },
    '@/lib/payments/site-url': { getCheckoutSiteUrl: () => 'https://www.ndcc.com.au' },
    '@/lib/order-input-validation': { readLimitedJsonObject: async () => ({ ok: true, value: { order_id: order.id, amount: 55 } }) },
  });
  const result = await route.POST({});
  assert.equal(result.status, 200, JSON.stringify(result));
  const expectedPublic = version === '1' ? internalReference : order.payment_reference;
  assert.equal(result.body.payment_reference, expectedPublic);
  assert.equal(payload.client_reference_id, expectedPublic);
  assert.equal(payload.metadata.payment_reference, expectedPublic);
  assert.equal(payload.metadata.item_number, expectedPublic);
  assert.equal(payload.metadata.ndcc_payment_reference, expectedPublic);
  assert.deepEqual(payload.metadata, payload.payment_intent_data.metadata);
  assert.ok(payload.payment_intent_data.description.startsWith(expectedPublic));
  assert.equal(linkedMetadata.payment_reference, internalReference, 'Internal transaction identity remains immutable');
  assert.equal(reservations, version === 'new' ? 1 : 0);
  if (version !== '1') assert.equal(payload.metadata.ndcc_transaction_reference, internalReference);
}
console.log('Actual Checkout route: new v2 public reference parity and frozen v1/v2 retry compatibility passed.');
