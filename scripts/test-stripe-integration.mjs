#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = mkdtempSync(path.join(tmpdir(), 'ndcc-stripe-'));

const paymentConfigSource = readFileSync(path.join(repoRoot, 'lib/payments/payment-config.ts'), 'utf8')
  .replace("import 'server-only';", '');
writeFileSync(path.join(stage, 'payment-config.ts'), paymentConfigSource);
writeFileSync(
  path.join(stage, 'stripe-checkout.ts'),
  readFileSync(path.join(repoRoot, 'lib/payments/stripe-checkout.ts'), 'utf8')
);

const paymentConfig = await import(pathToFileURL(path.join(stage, 'payment-config.ts')).href);
const stripeCheckout = await import(pathToFileURL(path.join(stage, 'stripe-checkout.ts')).href);

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

function withPaymentEnv(values, fn) {
  const names = ['PAYMENT_PROVIDER', 'PAYMENT_TEST_MODE', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    Object.assign(process.env, values);
    fn();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

function hasManualPaymentMethodList(source) {
  return /payment_method_types\s*:/.test(source);
}

console.log('Checks:');

test('key mode recognises test, live, restricted and unknown keys', () => {
  assert.equal(paymentConfig.getStripeSecretKeyMode('sk_test_example'), 'test');
  assert.equal(paymentConfig.getStripeSecretKeyMode('rk_test_example'), 'test');
  assert.equal(paymentConfig.getStripeSecretKeyMode('sk_live_example'), 'live');
  assert.equal(paymentConfig.getStripeSecretKeyMode('rk_live_example'), 'live');
  assert.equal(paymentConfig.getStripeSecretKeyMode('not-a-stripe-key'), 'unknown');
  assert.equal(paymentConfig.getStripeSecretKeyMode(''), 'missing');
});

test('checkout stays disabled when provider, webhook or mode is wrong', () => {
  withPaymentEnv({ PAYMENT_PROVIDER: 'manual', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' }, () => {
    assert.equal(paymentConfig.isCheckoutEnabled(), false);
  });
  withPaymentEnv({ PAYMENT_PROVIDER: 'stripe_checkout', STRIPE_SECRET_KEY: 'sk_test_x' }, () => {
    assert.equal(paymentConfig.isCheckoutEnabled(), false);
  });
  withPaymentEnv({ PAYMENT_PROVIDER: 'stripe_checkout', PAYMENT_TEST_MODE: 'true', STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' }, () => {
    assert.equal(paymentConfig.isCheckoutEnabled(), false);
  });
  withPaymentEnv({ PAYMENT_PROVIDER: 'stripe_checkout', PAYMENT_TEST_MODE: 'false', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' }, () => {
    assert.equal(paymentConfig.isCheckoutEnabled(), false);
  });
});

test('matching test and live configurations arm checkout', () => {
  withPaymentEnv({ PAYMENT_PROVIDER: 'stripe_checkout', PAYMENT_TEST_MODE: 'true', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' }, () => {
    assert.equal(paymentConfig.isCheckoutEnabled(), true);
  });
  withPaymentEnv({ PAYMENT_PROVIDER: 'stripe_checkout', PAYMENT_TEST_MODE: 'false', STRIPE_SECRET_KEY: 'rk_live_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' }, () => {
    assert.equal(paymentConfig.isCheckoutEnabled(), true);
  });
});

test('idempotency key is stable and changes with ledger state or amount', () => {
  const base = stripeCheckout.buildCheckoutIdempotencyKey({ orderId: 'order-1', amountPaidCents: 0, amountCents: 5000 });
  assert.equal(base, stripeCheckout.buildCheckoutIdempotencyKey({ orderId: 'order-1', amountPaidCents: 0, amountCents: 5000 }));
  assert.notEqual(base, stripeCheckout.buildCheckoutIdempotencyKey({ orderId: 'order-1', amountPaidCents: 1000, amountCents: 4000 }));
  assert.notEqual(base, stripeCheckout.buildCheckoutIdempotencyKey({ orderId: 'order-1', amountPaidCents: 0, amountCents: 4000 }));
});

test('webhook event classification covers immediate and delayed outcomes', () => {
  assert.equal(stripeCheckout.getCheckoutEventAction('checkout.session.completed', 'paid'), 'settle');
  assert.equal(stripeCheckout.getCheckoutEventAction('checkout.session.completed', 'unpaid'), 'pending');
  assert.equal(stripeCheckout.getCheckoutEventAction('checkout.session.async_payment_succeeded', 'paid'), 'settle');
  assert.equal(stripeCheckout.getCheckoutEventAction('checkout.session.async_payment_failed', 'unpaid'), 'fail');
  assert.equal(stripeCheckout.getCheckoutEventAction('checkout.session.expired', 'unpaid'), 'fail');
  assert.equal(stripeCheckout.getCheckoutEventAction('customer.created', null), 'ignore');
});

const checkoutRoute = readFileSync(path.join(repoRoot, 'app/api/payments/checkout-session/route.ts'), 'utf8');
const webhookRoute = readFileSync(path.join(repoRoot, 'app/api/stripe/webhook/route.ts'), 'utf8');
const stripeCheckoutSource = readFileSync(path.join(repoRoot, 'lib/payments/stripe-checkout.ts'), 'utf8');
const stripeClient = readFileSync(path.join(repoRoot, 'lib/stripe.ts'), 'utf8');
const migration = readFileSync(path.join(repoRoot, 'supabase/migrations/20260806080000_stripe_checkout_integrity.sql'), 'utf8');
const legacyRoute = readFileSync(path.join(repoRoot, 'app/api/checkout/route.ts'), 'utf8');

test('manual payment-method detector catches a known-defective Checkout snippet', () => {
  assert.equal(hasManualPaymentMethodList("stripe.checkout.sessions.create({ payment_method_types: ['card'] })"), true);
});

test('Checkout route uses dynamic methods, idempotency and a pending ledger row', () => {
  assert.equal(hasManualPaymentMethodList(checkoutRoute), false);
  assert.match(checkoutRoute, /idempotencyKey/);
  assert.match(checkoutRoute, /status:\s*'pending'/);
  assert.match(checkoutRoute, /client_reference_id/);
});

test('webhook route covers signed delayed-payment lifecycle events', () => {
  assert.match(webhookRoute, /constructEvent/);
  assert.match(stripeCheckoutSource, /async_payment_succeeded/);
  assert.match(stripeCheckoutSource, /async_payment_failed/);
  assert.match(stripeCheckoutSource, /session\.expired/);
});

test('Stripe SDK and ledger integrity gates are current', () => {
  assert.match(stripeClient, /2026-02-25\.clover/);
  assert.match(migration, /order_payments_provider_reference_unique/);
  assert.match(migration, /new\.provider_reference is distinct from old\.provider_reference/);
});

test('legacy direct checkout cannot bypass the order-first flow', () => {
  assert.match(legacyRoute, /status:\s*410/);
  assert.doesNotMatch(legacyRoute, /checkout\.sessions\.create/);
});

console.log(`\ntest-stripe-integration: ${passed} tests passed`);
