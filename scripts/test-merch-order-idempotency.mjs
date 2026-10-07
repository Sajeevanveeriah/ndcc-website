#!/usr/bin/env node
// Merchandise order idempotency: executes the real POST /api/orders handler
// against an in-memory orders table that enforces the partial unique index
// from 20261007005400_merch_order_idempotency_key.sql. Supabase, email and
// payment references are mocked; no network, database or email is touched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

// The route refuses to run without Supabase configuration; these values are never contacted.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://supabase.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const require = createRequire(import.meta.url);
const ts = require(process.env.NDCC_TEST_TYPESCRIPT || 'typescript');
const root = path.resolve(import.meta.dirname, '..');

function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const source = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: file })((id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('@/')) return load(path.join(root, `${id.slice(2)}.ts`));
      if (id.startsWith('.')) return load(path.resolve(path.dirname(file), `${id}.ts`));
      return require(id);
    }, module, module.exports);
    return module.exports;
  }
  return (file) => load(path.join(root, file));
}

// ---- In-memory database -------------------------------------------------
const windowId = '44444444-4444-4444-8444-444444444444';
const merchWindow = {
  id: windowId, label: 'Summer 2026', active: true, allow_queue_after_close: false,
  open_date: new Date(Date.now() - 86_400_000).toISOString(), close_date: new Date(Date.now() + 86_400_000).toISOString(),
};
const product = { id: 'p1', slug: 'club-cap', name: 'Club Cap', price: 25, active: true, sizes: ['One Size'], customisable: false };
let orders, inserts, emails, referenceCount, legacySchema, uniqueViolations;
function reset() { orders = []; inserts = 0; uniqueViolations = 0; emails = []; referenceCount = 0; legacySchema = false; }
reset();

const missingColumn = (column) => ({ code: 'PGRST204', message: `Could not find the '${column}' column of 'orders' in the schema cache` });
const tick = () => new Promise((resolve) => setImmediate(resolve));

function query(table) {
  const filters = [];
  let insertRow = null;
  const rows = () => {
    if (table === 'orders') return orders;
    if (table === 'merch_order_windows') return [merchWindow];
    if (table === 'apparel_products') return [product];
    return [];
  };
  async function run(single) {
    await tick();
    if (insertRow) {
      const idempotencyColumn = Object.keys(insertRow).find((key) => key.startsWith('order_idempotency_'));
      if (legacySchema && idempotencyColumn) return { data: null, error: missingColumn(idempotencyColumn) };
      const key = insertRow.order_idempotency_key;
      if (key && orders.some((row) => row.order_idempotency_key === key)) {
        uniqueViolations += 1;
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "orders_order_idempotency_key_unique"' } };
      }
      inserts += 1;
      const saved = { id: `order-${inserts}`, deleted_at: null, ...insertRow };
      orders.push(saved);
      return { data: { id: saved.id }, error: null };
    }
    if (legacySchema && filters.some(([column]) => column.startsWith('order_idempotency_'))) {
      return { data: null, error: { code: '42703', message: 'column orders.order_idempotency_key does not exist' } };
    }
    const matched = rows().filter((row) => filters.every(([column, value]) => row[column] === value));
    return { data: single ? matched[0] ?? null : matched, error: null };
  }
  const q = {
    select() { return q; }, order() { return q; }, limit() { return q; },
    eq(column, value) { filters.push([column, value]); return q; },
    insert(row) { insertRow = { ...row }; return q; },
    maybeSingle() { return run(true); }, single() { return run(true); },
    then(resolve, reject) { return run(false).then(resolve, reject); },
  };
  return q;
}
const db = { from: query };

const mocks = {
  'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
  '@/lib/supabase-server': { createServerClient: () => db },
  '@/lib/server/request-guards': {
    enforceRateLimit: async () => true, enforceHoneypotAndTiming: () => true,
    enforceTurnstile: async () => true, getClientIp: () => 'test',
  },
  '@/lib/payments/capabilities': {
    loadMerchPaymentSettings: async () => ({}),
    deriveCapabilities: () => ({ card: true, bank_transfer: true, pay_at_club: true }),
  },
  '@/lib/payments/reference': {
    generateUniquePaymentReference: async () => `NDCCMER-2026-${String(++referenceCount).padStart(6, '0')}`,
  },
  '@/lib/notification-recipients': {
    getReceiptRecipients: async (purchaser) => ({ to: [purchaser] }),
    getStaffOrderNotificationRecipients: async () => [],
  },
  '@/lib/email': {
    sendEmail: async (payload) => { emails.push(payload); return { status: 'sent' }; },
    emailHtml: (_title, body) => body, bankDetailsHtml: () => '',
  },
};
const route = loader(mocks)('app/api/orders/route.ts');

const key = '55555555-5555-4555-8555-555555555555';
const otherKey = '66666666-6666-4666-8666-666666666666';
const payload = (overrides = {}) => ({
  customer_name: 'Pat Purchaser', customer_email: 'pat@example.com', customer_phone: '0412345678',
  notes: '', items: [{ slug: 'club-cap', name: 'Club Cap', size: 'One Size', quantity: 2, price: 25 }],
  total_amount: 50, order_category: 'merch', payment_method: 'bank_transfer', merch_window_id: windowId,
  hp_field: '', submitted_at: Date.now() - 10_000, ...overrides,
});
const post = (body) => route.POST(new Request('http://localhost:3100/api/orders', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));

let passed = 0;
async function test(name, fn) { reset(); await fn(); passed += 1; console.log(`  ok - ${name}`); }

await test('first request with a key creates one order, stores the key and sends one email', async () => {
  const response = await post(payload({ idempotency_key: key }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.order_id, 'order-1');
  assert.equal(body.payment_reference, 'NDCCMER-2026-000001');
  assert.equal(inserts, 1);
  assert.equal(emails.length, 1);
  assert.equal(orders[0].order_idempotency_key, key);
  assert.match(orders[0].order_idempotency_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(response.headers.get('Idempotent-Replayed'), null);
});

await test('repeat with the same key and payload returns the original order without inserting or emailing', async () => {
  const first = await (await post(payload({ idempotency_key: key }))).json();
  const repeatResponse = await post(payload({ idempotency_key: key }));
  assert.equal(repeatResponse.status, 200);
  assert.equal(repeatResponse.headers.get('Idempotent-Replayed'), 'true');
  const repeat = await repeatResponse.json();
  assert.deepEqual(Object.keys(repeat).sort(), Object.keys(first).sort(), 'replay keeps the response shape');
  assert.deepEqual(repeat, first, 'replay returns the original confirmation');
  assert.equal(inserts, 1);
  assert.equal(emails.length, 1);
  assert.equal(referenceCount, 1, 'a replay does not reserve another payment reference');
});

await test('key matching is case-insensitive and still replays', async () => {
  await post(payload({ idempotency_key: key }));
  const repeat = await post(payload({ idempotency_key: key.toUpperCase() }));
  assert.equal(repeat.status, 200);
  assert.equal((await repeat.json()).order_id, 'order-1');
  assert.equal(inserts, 1);
});

await test('same key with a different payload or purchaser is refused with 409 and creates nothing', async () => {
  await post(payload({ idempotency_key: key }));
  for (const changed of [
    payload({ idempotency_key: key, items: [{ slug: 'club-cap', name: 'Club Cap', size: 'One Size', quantity: 3, price: 25 }], total_amount: 75 }),
    payload({ idempotency_key: key, customer_email: 'someone.else@example.com' }),
    payload({ idempotency_key: key, payment_method: 'pay_at_club' }),
  ]) {
    const response = await post(changed);
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.order_id, undefined, 'a conflict never discloses the original order');
  }
  assert.equal(inserts, 1);
  assert.equal(emails.length, 1);
});

await test('a key whose order the club removed is refused with 409', async () => {
  await post(payload({ idempotency_key: key }));
  orders[0].deleted_at = new Date().toISOString();
  const response = await post(payload({ idempotency_key: key }));
  assert.equal(response.status, 409);
  assert.equal(inserts, 1);
  assert.equal(emails.length, 1);
});

await test('requests without a key keep working exactly as before (each one creates an order)', async () => {
  for (const body of [payload(), payload({ idempotency_key: null })]) {
    const response = await post(body);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).success, true);
  }
  assert.equal(inserts, 2);
  assert.equal(emails.length, 2);
  assert.ok(orders.every((row) => !('order_idempotency_key' in row) && !('order_idempotency_fingerprint' in row)));
});

await test('malformed keys are rejected before any database work', async () => {
  for (const bad of ['', 'not-a-uuid', 42, {}, ['x'], '55555555-5555-1555-8555-555555555555', `${key} `]) {
    const response = await post(payload({ idempotency_key: bad }));
    assert.equal(response.status, 400, `key ${JSON.stringify(bad)} must be rejected`);
  }
  assert.equal(inserts, 0);
  assert.equal(emails.length, 0);
});

await test('different keys create separate orders', async () => {
  await post(payload({ idempotency_key: key }));
  await post(payload({ idempotency_key: otherKey }));
  assert.equal(inserts, 2);
  assert.equal(emails.length, 2);
});

await test('simultaneous requests with the same key yield one order; the loser replays it via the unique index', async () => {
  const responses = await Promise.all([post(payload({ idempotency_key: key })), post(payload({ idempotency_key: key }))]);
  const bodies = await Promise.all(responses.map((response) => response.json()));
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.equal(bodies[0].order_id, bodies[1].order_id);
  assert.equal(inserts, 1);
  assert.equal(orders.length, 1);
  assert.equal(emails.length, 1);
  assert.equal(responses.filter((response) => response.headers.get('Idempotent-Replayed') === 'true').length, 1);
  assert.equal(uniqueViolations, 1, 'both passed the pre-check; the unique index decided the race');
});

await test('simultaneous conflicting requests with the same key: one order, the other gets 409', async () => {
  const responses = await Promise.all([
    post(payload({ idempotency_key: key })),
    post(payload({ idempotency_key: key, customer_email: 'other@example.com' })),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal(uniqueViolations, 1);
  assert.equal(inserts, 1);
  assert.equal(emails.length, 1);
});

await test('before the migration is applied, keyed requests still save one order as today', async () => {
  legacySchema = true;
  const response = await post(payload({ idempotency_key: key }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.equal(inserts, 1);
  assert.equal(emails.length, 1);
  assert.ok(!('order_idempotency_key' in orders[0]));
});

await test('migration declares an additive nullable column and a partial unique index', () => {
  const sql = readFileSync(path.join(root, 'supabase/migrations/20261007005400_merch_order_idempotency_key.sql'), 'utf8');
  assert.match(sql, /add column if not exists order_idempotency_key uuid;/);
  assert.match(sql, /add column if not exists order_idempotency_fingerprint text;/);
  assert.match(sql, /create unique index if not exists orders_order_idempotency_key_unique\s+on public\.orders \(order_idempotency_key\)\s+where order_idempotency_key is not null;/);
  const statements = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(statements, /\b(drop|delete|truncate|not null default)\b/i, 'additive only (rollback lives in comments)');
});

await test('merchandise client keeps one key per attempt and regenerates after success or changes', () => {
  const client = readFileSync(path.join(root, 'app/merchandise/MerchandiseClient.tsx'), 'utf8');
  assert.match(client, /orderAttempt\.current\?\.signature !== signature/);
  assert.match(client, /crypto\.randomUUID\(\)/);
  assert.match(client, /idempotency_key: idempotencyKey/);
  assert.match(client, /orderAttempt\.current = null;/);
});

console.log(`merch order idempotency: ${passed} passed`);
