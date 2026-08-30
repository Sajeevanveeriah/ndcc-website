#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), 'utf8');
const stage = mkdtempSync(path.join(tmpdir(), 'ndcc-payment-reference-'));

const referenceSource = read('lib/payments/reference.ts');
writeFileSync(
  path.join(stage, 'reference.ts'),
  referenceSource.replace(
    "import { createServerClient } from '@/lib/supabase-server';",
    'const createServerClient = () => { throw new Error("database access is not used by this test"); };',
  ),
);
writeFileSync(
  path.join(stage, 'site-url.ts'),
  read('lib/payments/site-url.ts').replace("import 'server-only';", ''),
);

const references = await import(pathToFileURL(path.join(stage, 'reference.ts')).href);
const siteUrls = await import(pathToFileURL(path.join(stage, 'site-url.ts')).href);

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

function withEnv(values, fn) {
  const names = ['NODE_ENV', 'VERCEL_ENV', 'NEXT_PUBLIC_SITE_URL'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    Object.assign(process.env, values);
    return fn();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

function listFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const absolute = path.join(directory, name);
    return statSync(absolute).isDirectory() ? listFiles(absolute) : [absolute];
  });
}

function assertCheckoutMetadataParity(source, label) {
  assert.match(source, /const paymentMetadata\s*=\s*\{/u, `${label} must define one metadata object.`);
  assert.match(source, /ndcc_payment_reference:\s*[a-zA-Z]+PaymentReference|ndcc_payment_reference:\s*paymentReference/u);
  assert.match(source, /item_number:\s*[a-zA-Z]+PaymentReference|item_number:\s*paymentReference/u);
  assert.match(source, /ndcc_reference_version:\s*'1'/u);
  assert.match(source, /metadata:\s*paymentMetadata/u, `${label} Checkout Session metadata is missing.`);
  assert.match(
    source,
    /payment_intent_data:\s*\{[\s\S]*?description:\s*`\$\{[a-zA-Z]+PaymentReference\}|payment_intent_data:\s*\{[\s\S]*?description:\s*`\$\{paymentReference\}/u,
    `${label} PaymentIntent description must start with the payment reference.`,
  );
  assert.match(
    source,
    /payment_intent_data:\s*\{[\s\S]*?metadata:\s*paymentMetadata/u,
    `${label} PaymentIntent metadata must reuse the Checkout Session metadata object.`,
  );
  assert.doesNotMatch(source, /payment_method_types\s*:/u, `${label} must use Stripe dynamic payment methods.`);
}

console.log('Checks:');

await test('the category prefix map is exact, including the requested kitchen spelling', () => {
  assert.deepEqual({ ...references.PAYMENT_REFERENCE_PREFIXES }, {
    merch: 'NDCCMER',
    kitchen: 'NCDDKIT',
    membership: 'NDCCMEM',
    event: 'NDCCEVT',
    raffle: 'NDCCRAF',
    dino_coach: 'NDCCDCO',
    general: 'NDCCPAY',
  });
});

await test('canonical references require category prefix, Melbourne year and six-digit sequence', () => {
  for (const [category, prefix] of Object.entries(references.PAYMENT_REFERENCE_PREFIXES)) {
    assert.equal(references.isCanonicalPaymentReference(`${prefix}-2026-000001`, category), true);
    assert.equal(references.isCanonicalPaymentReference(`${prefix}-2026-999999`, category), true);
  }
  assert.equal(references.isCanonicalPaymentReference('NDCCKIT-2026-000001', 'kitchen'), false);
  assert.equal(references.isCanonicalPaymentReference('NCDDKIT-20260830-000001', 'kitchen'), false);
  assert.equal(references.isCanonicalPaymentReference('NDCCMER-2026-1', 'merch'), false);
  assert.equal(references.isCanonicalPaymentReference('NDCCMER-2026-000001', 'event'), false);
  assert.equal(references.normalisePaymentReferenceCategory('merchandise'), 'merch');
  assert.equal(references.normalisePaymentReferenceCategory('dino-coach'), 'dino_coach');
  assert.equal(references.normalisePaymentReferenceCategory('unknown future payment'), 'general');
  assert.equal(references.normalisePaymentReferenceCategory('constructor'), 'general');
  assert.equal(references.normalisePaymentReferenceCategory('__proto__'), 'general');
});

await test('all four order-creation routes allocate their exact category', () => {
  const expected = {
    'app/api/orders/route.ts': 'merch',
    'app/api/kitchen/orders/route.ts': 'kitchen',
    'app/api/memberships/route.ts': 'membership',
    'app/api/events/route.ts': 'event',
  };
  for (const [relativePath, category] of Object.entries(expected)) {
    const source = read(relativePath);
    assert.match(source, new RegExp(`generateUniquePaymentReference\\('${category}'\\)`));
    assert.match(source, /payment_reference:\s*paymentReference/u);
  }
});

const genericCheckout = read('app/api/payments/checkout-session/route.ts');
const raffleCheckout = read('app/api/raffle/checkout/route.ts');
const dinoCheckout = read('app/api/fantasy/checkout/route.ts');

await test('generic, raffle and Dino Checkout metadata has PaymentIntent parity and item numbers', () => {
  assertCheckoutMetadataParity(genericCheckout, 'Generic order');
  assertCheckoutMetadataParity(raffleCheckout, 'Raffle');
  assertCheckoutMetadataParity(dinoCheckout, 'Dino Coach');
  assert.match(genericCheckout, /client_reference_id:\s*paymentReference/u);
  assert.match(raffleCheckout, /client_reference_id:\s*paymentReference/u);
  assert.match(dinoCheckout, /client_reference_id:\s*paymentReference/u);
});

await test('Stripe descriptions and product names carry the reportable payment reference', () => {
  assert.match(genericCheckout, /description:\s*`\$\{paymentReference\} - NDCC \$\{frozenCategoryLabel\}`/u);
  assert.match(genericCheckout, /name:\s*validation\.isPartial[\s\S]*?paymentReference/u);
  assert.match(raffleCheckout, /name:\s*`NDCC Dinos Trailer Raffle Ticket - \$\{paymentReference\}`/u);
  assert.match(raffleCheckout, /description:\s*`\$\{paymentReference\} - NDCC raffle`/u);
  assert.match(dinoCheckout, /name:\s*`Dino Coach 2026\/2027 entry - \$\{paymentReference\}`/u);
  assert.match(dinoCheckout, /description:\s*`\$\{paymentReference\} - NDCC Dino Coach`/u);
});

await test('customer receipts require the unique canonical payment-level reference', () => {
  const receipts = read('lib/payment-receipts.ts');
  const raffleEmail = read('lib/raffle-email.ts');
  const dinoReceipt = read('lib/dino-coach/payment-receipt.ts');
  const webhook = read('app/api/stripe/webhook/route.ts');
  assert.match(receipts, /select\('id,amount,currency,received_at,status,method,provider,provider_reference,payment_reference,metadata'\)/u);
  assert.match(receipts, /const reference = String\(payment\.payment_reference \|\| ''\)\.trim\(\)/u);
  assert.match(receipts, /isCanonicalPaymentReference\(reference, category\)/u);
  assert.doesNotMatch(receipts, /payment\.payment_reference\s*\|\|\s*order\.payment_reference/u);
  assert.match(raffleEmail, /reference:\s*String\(order\.payment_reference\)/u);
  assert.match(dinoReceipt, /const reference = String\(entry\.payment_reference \|\| ''\)\.trim\(\)/u);
  assert.match(dinoReceipt, /paymentType:\s*'Dino Coach Entry',[\s\S]*?reference,/u);
  assert.match(webhook, /queueAndAttemptReceipt\(supabase, 'dino_entry', entry\.id\)/u);
});

await test('direct Payment Links remain disabled and legacy checkout is gone', () => {
  const apiSources = listFiles(path.join(repoRoot, 'app/api'))
    .filter((absolute) => /\.(?:ts|tsx|js|mjs)$/u.test(absolute))
    .map((absolute) => readFileSync(absolute, 'utf8'))
    .join('\n');
  assert.doesNotMatch(apiSources, /paymentLinks|payment_links|payment_link\s*:/u);
  const legacyCheckout = read('app/api/checkout/route.ts');
  assert.match(legacyCheckout, /status:\s*410/u);
  assert.doesNotMatch(legacyCheckout, /checkout\.sessions\.create/u);
});

await test('Stripe is pinned to the current API version used by this implementation', () => {
  const stripeClient = read('lib/stripe.ts');
  assert.match(stripeClient, /apiVersion:\s*'2026-07-29\.dahlia'/u);
  assert.doesNotMatch(stripeClient, /2026-02-25\.clover/u);
});

await test('checkout return origins fail closed in production and stay usable in preview', () => {
  const productionRequest = new Request('https://attacker.invalid/api/payments/checkout-session');
  withEnv({ NODE_ENV: 'production' }, () => {
    assert.equal(siteUrls.getCheckoutSiteUrl(productionRequest), null);
  });
  withEnv({ VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'http://www.ndcc.com.au' }, () => {
    assert.equal(siteUrls.getCheckoutSiteUrl(productionRequest), null);
  });
  withEnv({ VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://user:secret@www.ndcc.com.au' }, () => {
    assert.equal(siteUrls.getCheckoutSiteUrl(productionRequest), null);
  });
  withEnv({ VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://www.ndcc.com.au/checkout' }, () => {
    assert.equal(siteUrls.getCheckoutSiteUrl(productionRequest), 'https://www.ndcc.com.au');
  });
  withEnv({ VERCEL_ENV: 'preview' }, () => {
    assert.equal(
      siteUrls.getCheckoutSiteUrl(new Request('https://ndcc-preview.vercel.app/api/raffle/checkout')),
      'https://ndcc-preview.vercel.app',
    );
  });
});

await test('signed refund and dispute evidence is normalised before Checkout handling', () => {
  const webhook = read('app/api/stripe/webhook/route.ts');
  for (const eventType of [
    'charge.refunded',
    'charge.dispute.created',
    'charge.dispute.updated',
    'charge.dispute.closed',
    'charge.dispute.funds_withdrawn',
    'charge.dispute.funds_reinstated',
  ]) {
    assert.match(webhook, new RegExp(`'${eventType.replaceAll('.', '\\.')}'`));
  }
  assert.match(webhook, /disputes\.retrieve\(disputeId\)/u);
  assert.doesNotMatch(webhook, /expand:\s*\['balance_transactions'\]/u);
  assert.match(webhook, /apply_stripe_financial_event/u);
  assert.match(webhook, /replayDeferredFinancialEvents/u);
  assert.match(webhook, /payment_domain',\s*'pending'/u);
  assert.ok(
    webhook.indexOf('constructEvent(') < webhook.indexOf('handleFinancialEvent(event)'),
    'No financial handler may run before Stripe signature verification.',
  );
  assert.ok(
    webhook.indexOf('handleFinancialEvent(event)') < webhook.indexOf('getCheckoutEventAction(event.type'),
    'Refund and dispute routing must run before Checkout Session classification.',
  );
});

await test('the payment-reference migration enforces atomic, private and unique allocation', () => {
  const migration = read('supabase/migrations/20260830130818_payment_reference_integrity.sql');
  assert.match(migration, /create table if not exists public\.payment_reference_counters/u);
  assert.match(migration, /primary key \(category, reference_year\)/u);
  assert.match(migration, /on conflict \(category, reference_year\) do update/u);
  assert.match(migration, /last_value = public\.payment_reference_counters\.last_value \+ 1/u);
  assert.match(migration, /at time zone 'Australia\/Melbourne'/u);
  assert.match(migration, /security definer[\s\S]*?set search_path = ''/u);
  assert.match(migration, /revoke all on function public\.allocate_payment_reference[\s\S]*?from public, anon, authenticated/u);
  assert.match(migration, /grant execute on function public\.allocate_payment_reference[\s\S]*?to service_role/u);
  for (const index of [
    'order_payments_payment_reference_unique',
    'raffle_orders_payment_reference_unique',
    'fantasy_entries_payment_reference_unique',
  ]) assert.match(migration, new RegExp(`create unique index if not exists ${index}`));
  assert.match(migration, /\^\(NDCC\(MER\|MEM\|EVT\|RAF\|DCO\|PAY\)\|NCDDKIT\)-\[0-9\]\{4\}-\[0-9\]\{6\}\$/u);
  assert.match(migration, /new\.payment_reference is distinct from old\.payment_reference/u);
  assert.match(migration, /ensure_fantasy_entry_payment_reference/u);
  assert.match(migration, /reserve_order_stripe_payment\([\s\S]*?target_checkout_origin text,[\s\S]*?target_return_path text/u);
  assert.match(migration, /checkout_contract_version', '1'/u);
  assert.match(migration, /checkout_created_at_unix'/u);
  assert.match(migration, /checkout_expires_at_unix'/u);
  assert.match(migration, /expires_at := reserved_at \+ interval '1 hour'/u);
  assert.equal(
    (migration.match(/created_at \+ interval '1 hour 5 minutes'/gu) || []).length,
    3,
    'reservation, manual-payment and import cleanup must all retain a full Session lifetime plus buffer',
  );
  assert.equal(
    (migration.match(/else created_at < pg_catalog\.now\(\) - interval '2 hours'/gu) || []).length,
    3,
    'legacy unlinked reservations need a conservative hold in every cleanup path',
  );
});

await test('the financial-event migration is movement-idempotent, atomic and preserves ticket history', () => {
  const migration = read('supabase/migrations/20260830130824_stripe_financial_event_integrity.sql');
  assert.match(migration, /provider_event_id text primary key/u);
  assert.match(migration, /status in \('pending', 'settled', 'failed', 'refunded', 'disputed', 'recovered', 'void'\)/u);
  assert.match(migration, /create or replace function public\.apply_stripe_financial_event/u);
  assert.doesNotMatch(migration, /create or replace function public\.apply_(?:order|raffle)_stripe_financial_event/u);
  assert.match(migration, /create table if not exists public\.stripe_disputes/u);
  assert.match(migration, /create table if not exists public\.stripe_dispute_balance_movements/u);
  assert.match(migration, /balance_transaction_id text primary key/u);
  assert.match(migration, /on conflict \(balance_transaction_id\) do nothing/u);
  assert.match(migration, /status in \('needs_response', 'under_review', 'lost'\)/u);
  assert.match(migration, /greatest\(raw_paid, 0\)/u);
  assert.match(migration, /payment_domain = 'pending'/u);
  assert.match(migration, /'rpc_args', replay_arguments/u);
  assert.match(migration, /on conflict \(provider_event_id\) do nothing/u);
  assert.match(migration, /old\.status in \('settled', 'refunded', 'disputed', 'recovered'\)/u);
  assert.match(migration, /foreign key \(order_payment_id\) references public\.order_payments\(id\) on delete cascade/u);
  assert.match(migration, /delete from stripe_dispute_balance_movements/u);
  assert.match(migration, /voided_at timestamptz/u);
  assert.match(migration, /void_reason text/u);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.raffle_tickets/iu);
  assert.match(migration, /set search_path = ''/u);
  assert.match(migration, /from public, anon, authenticated/u);
  assert.match(migration, /to service_role/u);
});

console.log(`\ntest-payment-reference-integrity: ${passed} tests passed`);
