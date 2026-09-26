#!/usr/bin/env node
// Deterministic checks for CMS-managed notification recipients (WP6a).
// No database, network, credentials or email: modules run with stubs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function moduleAt(path, dependencies = {}) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, console, Date, Set, Map, Number, Object, Array, String, Promise, process: { env: {} },
    require(name) {
      if (name === 'server-only') return {};
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

const plain = (value) => JSON.parse(JSON.stringify(value));
let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

const fallback = moduleAt('lib/notification-recipients-fallback.ts');
const core = moduleAt('lib/notification-recipients-core.ts', { './notification-recipients-fallback': fallback });
const receipts = moduleAt('lib/payments/receipt-recipients.ts', { '@/lib/notification-recipients-fallback': fallback });

// The exact hardcoded recipients before WP6a, per call site.
const PREVIOUS = {
  dino_registration_copy: ['sajeevanveeriah@gmail.com'],
  dino_receipt_copy: ['sajeevanveeriah@gmail.com'],
  apparel_order_staff: ['ndcc.secretary1@gmail.com', 'joshwalker20695@gmail.com'],
  kitchen_order_staff: ['ndcc.secretary1@gmail.com', 'ndcc.treasurer1@gmail.com'],
  raffle_staff: ['ndsc.cricket@gmail.com', 'ndcc.vicepres@gmail.com', 'ndcc.secretary1@gmail.com'],
  receipt_copy: ['ndcc.secretary1@gmail.com', 'ndsc.cricket@gmail.com'],
  contact: ['ndcc.secretary1@gmail.com'],
};

const migration = readFileSync('supabase/migrations/20260927060000_notification_recipients.sql', 'utf8');

function seededRecipients() {
  const values = migration.split('insert into public.notification_recipients')[1].split(';')[0];
  const rows = [...values.matchAll(/\('([a-z_]+)', '([^']+)', (\d+)\)/g)].map(([, event_type, email, sort]) => ({ event_type, email, sort_order: Number(sort), active: true }));
  return core.groupActiveRecipients(rows);
}

console.log('Notification recipient checks:');

await test('fallback constants equal the previous hardcoded recipients for every event type', () => {
  assert.deepEqual(plain(fallback.NOTIFICATION_EVENT_TYPES).sort(), Object.keys(PREVIOUS).sort());
  for (const [type, emails] of Object.entries(PREVIOUS)) assert.deepEqual(plain(fallback.fallbackNotificationRecipients(type)), emails, type);
});

await test('migration seeds exactly the fallback recipients, in order, so routing is identical after deploy', () => {
  assert.deepEqual(plain(seededRecipients()), PREVIOUS);
});

await test('migration event type check list matches the application list', () => {
  const check = migration.match(/event_type text not null check \(event_type in \(([\s\S]*?)\)\)/)[1];
  assert.deepEqual([...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort(), Object.keys(PREVIOUS).sort());
});

await test('migration is additive, locked, RLS-protected, service-role only and documents rollback', () => {
  assert.match(migration, /^-- [\s\S]*Rollback[\s\S]*drop table if exists public\.notification_recipients/m);
  assert.match(migration, /\nbegin;\nset local lock_timeout = '3s';/);
  assert.match(migration, /alter table public\.notification_recipients enable row level security;/);
  assert.match(migration, /revoke all on public\.notification_recipients from public, anon, authenticated;/);
  assert.match(migration, /grant select, insert, update, delete on public\.notification_recipients to service_role;/);
  assert.match(migration, /create unique index notification_recipients_event_email_key\s+on public\.notification_recipients \(event_type, lower\(email\)\);/);
  assert.match(migration, /\ncommit;\n$/);
  const statements = migration.split('\n').filter((line) => !line.startsWith('--')).join('\n');
  assert.doesNotMatch(statements, /\b(drop|alter) table (?!public\.notification_recipients)/i);
});

await test('unreadable table falls back; readable table with no rows sends to nobody', () => {
  assert.deepEqual(plain(core.recipientsForEvent({ readable: false }, 'raffle_staff')), PREVIOUS.raffle_staff);
  assert.deepEqual(plain(core.recipientsForEvent({ readable: true, byType: {} }, 'raffle_staff')), []);
  assert.deepEqual(plain(core.recipientsForEvent({ readable: true, byType: { raffle_staff: ['a@example.com'] } }, 'raffle_staff')), ['a@example.com']);
});

await test('grouping ignores inactive, invalid, duplicate and unknown rows and keeps display order', () => {
  const grouped = core.groupActiveRecipients([
    { event_type: 'contact', email: 'second@example.com', sort_order: 20 },
    { event_type: 'contact', email: ' First@Example.com ', sort_order: 10 },
    { event_type: 'contact', email: 'first@example.com', sort_order: 30 },
    { event_type: 'contact', email: 'paused@example.com', sort_order: 5, active: false },
    { event_type: 'contact', email: 'not-an-email', sort_order: 1 },
    { event_type: 'unknown_type', email: 'x@example.com', sort_order: 1 },
  ]);
  assert.deepEqual(plain(grouped), { contact: ['first@example.com', 'second@example.com'] });
});

await test('email and name normalisation', () => {
  assert.equal(core.normaliseRecipientEmail(' Treasurer@Example.COM '), 'treasurer@example.com');
  for (const bad of ['', 'a@b', 'two@example.com,three@example.com', 'a b@example.com', '<x@example.com>', null, 5]) {
    assert.equal(core.normaliseRecipientEmail(bad), null, String(bad));
  }
  assert.equal(core.normaliseRecipientName('  Club   Treasurer '), 'Club Treasurer');
  assert.equal(core.normaliseRecipientName('   '), null);
});

await test('receipt addressing uses the club copy list supplied by the CMS', () => {
  assert.deepEqual(plain(receipts.receiptRecipients('Buyer@Example.com', ['staff@example.com'], ['club@example.com'])), { to: 'buyer@example.com', bcc: ['club@example.com', 'staff@example.com'] });
  assert.deepEqual(plain(receipts.receiptRecipients('buyer@example.com', [], [])), { to: 'buyer@example.com' });
  assert.deepEqual(plain(receipts.receiptRecipients('buyer@example.com')).bcc, PREVIOUS.receipt_copy);
});

await test('server helper returns CMS rows, falls back only when unreadable, and keeps CONTACT_TO_EMAIL priority', async () => {
  let result = { data: [], error: null };
  const client = { from(table) {
    assert.equal(table, 'notification_recipients');
    const chain = { select: () => chain, eq: () => chain, order: () => chain, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    return chain;
  } };
  const contactBase = { contactToPresent: false, effectiveContactRecipient: 'ndcc.secretary1@gmail.com', cc: ['Extra@Example.com'], bcc: [] };
  const load = () => moduleAt('lib/notification-recipients.ts', {
    react: { cache: (fn) => fn },
    'next/cache': { unstable_cache: () => async () => { throw new Error('no incremental cache in tests'); } },
    '@/lib/supabase-server': { createServerClient: () => client, isServerSupabaseConfigured: () => true },
    '@/lib/payments/receipt-recipients': receipts,
    '@/lib/email': { getContactEmailRecipients: () => ({ ...contactBase }) },
    '@/lib/notification-recipients-core': core,
    '@/lib/notification-recipients-fallback': fallback,
  });
  result = { data: [{ event_type: 'raffle_staff', email: 'raffle@example.com', sort_order: 10, active: true }, { event_type: 'contact', email: 'enquiries@example.com', sort_order: 10, active: true }, { event_type: 'contact', email: 'copy@example.com', sort_order: 20, active: true }], error: null };
  let helper = load();
  assert.deepEqual(plain(await helper.getNotificationRecipients('raffle_staff')), ['raffle@example.com']);
  assert.deepEqual(plain(await helper.getNotificationRecipients('dino_receipt_copy')), [], 'removed in CMS means nobody');
  assert.deepEqual(plain(await helper.getReceiptRecipients('buyer@example.com', ['raffle@example.com'])), { to: 'buyer@example.com', bcc: ['raffle@example.com'] });
  const contact = await helper.getContactNotificationRecipients();
  assert.equal(contact.effectiveContactRecipient, 'enquiries@example.com');
  assert.deepEqual(plain(contact.cc), ['copy@example.com', 'extra@example.com']);
  contactBase.contactToPresent = true;
  assert.equal((await helper.getContactNotificationRecipients()).effectiveContactRecipient, 'ndcc.secretary1@gmail.com', 'server setting keeps priority');
  contactBase.contactToPresent = false;

  result = { data: null, error: { message: "Could not find the table 'public.notification_recipients' in the schema cache" } };
  helper = load();
  const warn = console.warn; console.warn = () => {};
  try {
    for (const [type, emails] of Object.entries(PREVIOUS)) assert.deepEqual(plain(await helper.getNotificationRecipients(type)), emails, type);
    assert.equal((await helper.getContactNotificationRecipients()).effectiveContactRecipient, 'ndcc.secretary1@gmail.com');
  } finally { console.warn = warn; }

  result = { data: [], error: null };
  helper = load();
  assert.equal((await helper.getContactNotificationRecipients()).effectiveContactRecipient, 'ndcc.secretary1@gmail.com', 'enquiries never lose their recipient');
});

await test('hardcoded personal and officer addresses exist only in the fallback file (and the email footer fallback)', () => {
  const files = ['lib/dino-coach/registration-email.ts', 'lib/dino-coach/payment-receipt.ts', 'lib/order-notification-content.ts', 'lib/raffle-email.ts', 'lib/payments/receipt-recipients.ts', 'lib/email.ts', 'lib/payment-receipts.ts'];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /[a-z0-9.+_-]+@gmail\.com/i, file);
  }
});

await test('email senders read recipients through the CMS helper', () => {
  assert.match(readFileSync('lib/dino-coach/registration-email.ts', 'utf8'), /getNotificationRecipients\('dino_registration_copy'\)/);
  assert.match(readFileSync('lib/dino-coach/payment-receipt.ts', 'utf8'), /getNotificationRecipients\('dino_receipt_copy'\)/);
  assert.match(readFileSync('lib/raffle-email.ts', 'utf8'), /getNotificationRecipients\('raffle_staff'\)/);
  assert.match(readFileSync('lib/payment-receipts.ts', 'utf8'), /getReceiptRecipients\(order\.customer_email, department \? await getStaffOrderNotificationRecipients\(department\) : \[\]\)/);
  assert.match(readFileSync('app/api/contacts/route.ts', 'utf8'), /await getContactNotificationRecipients\(\)/);
});

await test('email footer uses club settings with the previous footer as fallback', () => {
  const email = readFileSync('lib/email.ts', 'utf8');
  assert.match(email, /location: 'Grinter Reserve, 141 Coppards Road, Moolap VIC 3224'/);
  assert.match(email, /email: DEFAULT_CONTACT_EMAIL/);
  assert.match(email, /const DEFAULT_CONTACT_EMAIL = FALLBACK_NOTIFICATION_RECIPIENTS\.contact\[0\];/);
  assert.match(email, /settings === fallbackClubSettings\) return null/);
  assert.match(email, /html: await withClubFooterContact\(payload\.html\)/);
  assert.match(email, /Newcomb and District Cricket Club &bull; \$\{FALLBACK_FOOTER_CONTACT_HTML\}/);
});

await test('admin notifications API is full-access only and revalidates the recipient cache', () => {
  const route = readFileSync('app/api/admin/notifications/route.ts', 'utf8');
  assert.match(route, /requirePermission\('dashboard', FULL_ACCESS_ROLES\)/);
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    assert.match(route, new RegExp(`export async function ${method}\\([^)]*\\) \\{\\n  if \\(!await authorise\\(\\)\\) return json\\(\\{ success: false, error: 'Forbidden\\.' \\}, 403\\);`), method);
  }
  assert.equal((route.match(/revalidate\(\);/g) || []).length, 3);
  assert.match(route, /Website enquiries need at least one active recipient/);
  assert.doesNotMatch(route, /error: error\.message/);
  const layout = readFileSync('app/admin/layout.tsx', 'utf8');
  assert.match(layout, /\{ href: '\/admin\/notifications', label: 'Notification Emails'[^}]*fullAccessOnly: true \}/);
  assert.match(layout, /if \(link\.fullAccessOnly && !isFullAccessRole\(user\.role\)\) return false;/);
  const permissions = readFileSync('lib/auth/permissions.ts', 'utf8');
  assert.doesNotMatch(permissions, /\/admin\/notifications/, 'unregistered admin paths stay full-access only');
});

console.log(`test-notification-recipients: ${passed} tests passed`);
