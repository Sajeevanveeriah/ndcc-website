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

test('idempotency key is stable and scoped to the reserved payment reference', () => {
  const base = stripeCheckout.buildCheckoutIdempotencyKey({ paymentReference: 'NDCCMER-2026-000001' });
  assert.equal(base, stripeCheckout.buildCheckoutIdempotencyKey({ paymentReference: 'NDCCMER-2026-000001' }));
  assert.notEqual(base, stripeCheckout.buildCheckoutIdempotencyKey({ paymentReference: 'NDCCMER-2026-000002' }));
  assert.notEqual(base, stripeCheckout.buildCheckoutIdempotencyKey({ paymentReference: 'NCDDKIT-2026-000001' }));
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
const integrityMigration = readFileSync(path.join(repoRoot, 'supabase/migrations/20260816025155_stripe_checkout_integrity.sql'), 'utf8');
const eventOrderMigration = readFileSync(path.join(repoRoot, 'supabase/migrations/20260806092106_event_registration_order_payments.sql'), 'utf8');
const legacyRoute = readFileSync(path.join(repoRoot, 'app/api/checkout/route.ts'), 'utf8');
const dinoCheckoutRoute = readFileSync(path.join(repoRoot, 'app/api/fantasy/checkout/route.ts'), 'utf8');
const sharedPaymentControl = readFileSync(path.join(repoRoot, 'components/payments/OrderPaymentOptions.tsx'), 'utf8');
const membershipRoute = readFileSync(path.join(repoRoot, 'app/api/memberships/route.ts'), 'utf8');
const eventRoute = readFileSync(path.join(repoRoot, 'app/api/events/route.ts'), 'utf8');
const joinPage = readFileSync(path.join(repoRoot, 'app/join/page.tsx'), 'utf8');
const kitchenPage = readFileSync(path.join(repoRoot, 'app/kitchen/page.tsx'), 'utf8');
const eventPage = readFileSync(path.join(repoRoot, 'app/events/[id]/EventDetailClient.tsx'), 'utf8');
const paymentResultPage = readFileSync(path.join(repoRoot, 'app/payment/page.tsx'), 'utf8');

test('manual payment-method detector catches a known-defective Checkout snippet', () => {
  assert.equal(hasManualPaymentMethodList("stripe.checkout.sessions.create({ payment_method_types: ['card'] })"), true);
});

test('Checkout route uses dynamic methods, idempotency and an atomic pending reservation', () => {
  assert.equal(hasManualPaymentMethodList(checkoutRoute), false);
  assert.match(checkoutRoute, /idempotencyKey/);
  assert.match(checkoutRoute, /reserve_order_stripe_payment/);
  assert.match(checkoutRoute, /reservationId/);
  assert.match(checkoutRoute, /client_reference_id/);
  assert.match(checkoutRoute, /target_checkout_origin:\s*siteUrl/);
  assert.match(checkoutRoute, /target_return_path:\s*returnPath/);
  assert.match(checkoutRoute, /expires_at:\s*checkoutExpiresAtUnix/);
  assert.doesNotMatch(checkoutRoute, /expires_at:\s*Math\.floor\(Date\.now/);
});

test('Checkout route has category-aware descriptions and safe return paths', () => {
  assert.match(checkoutRoute, /order_category/);
  assert.match(checkoutRoute, /getSafeReturnPath/);
  assert.match(checkoutRoute, /encodeURIComponent\(checkoutContract\.returnPath\)/);
  assert.match(checkoutRoute, /Newcomb & District Cricket Club \$\{frozenCategoryLabel\}/);
  assert.match(paymentResultPage, /Payment submitted/);
  assert.match(paymentResultPage, /safeReturnPath/);
});

test('open Checkout reuse validates the complete financial and reference contract', () => {
  for (const pattern of [
    /existingSession\.mode === 'payment'/,
    /existingSession\.amount_total === attemptAmountCents/,
    /existingSession\.currency\?\.toLowerCase\(\) === 'aud'/,
    /sessionMetadata\.ndcc_payment_type === paymentCategory/,
    /sessionMetadata\.ndcc_order_id === order\.id/,
    /sessionMetadata\.ndcc_payment_reference === attempt\.payment_reference/,
    /sessionMetadata\.expected_amount_cents === String\(attemptAmountCents\)/,
    /sessionMetadata\.payment_kind === paymentKind/,
    /existingSession\.client_reference_id === attempt\.payment_reference/,
  ]) assert.match(checkoutRoute, pattern);
});

test('webhook route covers signed delayed-payment lifecycle events', () => {
  assert.match(webhookRoute, /constructEvent/);
  assert.match(stripeCheckoutSource, /async_payment_succeeded/);
  assert.match(stripeCheckoutSource, /async_payment_failed/);
  assert.match(stripeCheckoutSource, /session\.expired/);
});

test('Stripe SDK and ledger integrity gates are current', () => {
  assert.match(stripeClient, /2026-07-29\.dahlia/);
  assert.match(integrityMigration, /order_payments_provider_reference_unique/);
  assert.match(integrityMigration, /unique \(provider, provider_reference\)/);
  assert.match(integrityMigration, /group by provider, provider_reference[\s\S]*?having count\(\*\) > 1/);
  assert.match(integrityMigration, /new\.provider_reference is distinct from old\.provider_reference/);
});

test('legacy direct checkout cannot bypass the order-first flow', () => {
  assert.match(legacyRoute, /status:\s*410/);
  assert.doesNotMatch(legacyRoute, /checkout\.sessions\.create/);
});

test('Dino Coach Checkout is concurrency-safe and retryable after a stale session', () => {
  assert.match(dinoCheckoutRoute, /upsert\([\s\S]*onConflict:\s*'manager_id,season_id'/);
  assert.match(dinoCheckoutRoute, /stripe_checkout_session_id\s*\|\|\s*'first'/);
  assert.match(dinoCheckoutRoute, /\['payment_required','pending','failed','expired'\]/);
  assert.match(dinoCheckoutRoute, /enforceRateLimit\(`dino-checkout:/);
  assert.match(dinoCheckoutRoute, /readLimitedJsonObject\(request, 8 \* 1024\)/);
  assert.match(dinoCheckoutRoute, /rawBody\.error === 'Request body is too large\.' \? 413 : 400/);
  assert.doesNotMatch(dinoCheckoutRoute, /request\.json\(\)/);
  assert.match(dinoCheckoutRoute, /entry_fee_currency\)\.toLowerCase\(\) !== 'aud'/);
  assert.match(dinoCheckoutRoute, /payableStatuses\.includes\(entry\.status\)/);
  assert.match(dinoCheckoutRoute, /existing\.status === 'complete'/);
  assert.match(dinoCheckoutRoute, /existing\.mode === 'payment'/);
  assert.match(dinoCheckoutRoute, /session\.metadata\?\.item_number !== paymentReference/);
  assert.match(dinoCheckoutRoute, /expected_amount_cents:\s*String\(entry\.entry_fee_cents\)/);
  assert.match(dinoCheckoutRoute, /unit_amount:\s*entry\.entry_fee_cents/);
  assert.match(dinoCheckoutRoute, /createHash\('sha256'\)/);
  assert.match(dinoCheckoutRoute, /ndcc:dino:v2:/);
  assert.doesNotMatch(dinoCheckoutRoute, /expires_at:\s*Math\.floor\(Date\.now/);
});

test('shared payment control starts server-verified Checkout', () => {
  assert.match(sharedPaymentControl, /\/api\/payments\/capabilities/);
  assert.match(sharedPaymentControl, /\/api\/payments\/checkout-session/);
  assert.match(sharedPaymentControl, /order_id:\s*orderId/);
  assert.match(sharedPaymentControl, /return_path:\s*returnPath/);
  assert.match(sharedPaymentControl, /Pay \{formatCurrency\(totalAmount\)\} securely online/);
});

test('membership, kitchen and paid event surfaces use the shared payment control', () => {
  assert.match(joinPage, /OrderPaymentOptions/);
  assert.match(kitchenPage, /OrderPaymentOptions/);
  assert.match(eventPage, /OrderPaymentOptions/);
  assert.match(joinPage, /returnPath="\/join"/);
  assert.match(kitchenPage, /returnPath="\/kitchen"/);
  assert.match(eventPage, /returnPath=\{`\/events\/\$\{eventId\}`\}/);
});

test('membership orders use the correct category and full server total', () => {
  assert.match(membershipRoute, /order_category:\s*'membership'/);
  assert.match(membershipRoute, /total_amount:\s*totalAmount/);
  assert.match(membershipRoute, /bankDetailsHtml\(paymentReference, totalAmount\)/);
});

test('paid event registrations create and retain a linked order', () => {
  assert.match(eventRoute, /order_category:\s*'event'/);
  assert.match(eventRoute, /order_id:\s*linkedOrder\?\.id/);
  assert.match(eventRoute, /total_amount:\s*totalCost/);
  assert.match(eventOrderMigration, /add column if not exists order_id uuid/);
  assert.match(eventOrderMigration, /event_registrations_order_id_fkey/);
  assert.match(eventOrderMigration, /orders_sync_linked_payment_status/);
});

console.log(`\ntest-stripe-integration: ${passed} tests passed`);
