// Merchandise order attempts are shared across tabs: the same order submitted
// from a second open tab reuses the first tab's idempotency key, so the server
// replays the original order instead of creating a duplicate. Deliberate
// repeat orders (same page after success, or a reload) start fresh; only a
// digest is stored and it expires.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MERCH_ATTEMPT_STORAGE_NAME, MERCH_ATTEMPT_TTL_MS, completeMerchAttempt, forgetMerchAttempt, merchAttemptDigest,
  merchAttemptKey, merchAttemptSignature, pruneMerchAttempt, withMerchAttemptLock,
} from '../lib/merch-order-attempt.ts';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (name) => (data.has(name) ? data.get(name) : null),
    setItem: (name, value) => { data.set(name, String(value)); },
    removeItem: (name) => { data.delete(name); },
  };
}
let counter = 0;
const newKey = () => `key-${++counter}`;
const order = { customer_name: 'Jordan Example', customer_email: 'j@example.invalid', customer_phone: '0400000000', items: [{ slug: 'hoodie', quantity: 1 }], total_amount: 60 };

// Anti-spam fields differ per page load and are not part of "the same order".
assert.equal(merchAttemptSignature({ ...order, submitted_at: 1, hp_field: '' }), merchAttemptSignature({ ...order, submitted_at: 999, hp_field: '' }));
const digest = await merchAttemptDigest(merchAttemptSignature(order));
assert.match(digest, /^[0-9a-f]{64}$/);
assert.notEqual(await merchAttemptDigest(merchAttemptSignature({ ...order, total_amount: 120 })), digest);

const t0 = 1_000_000;
const tab = (pageLoadedAt) => ({ pageLoadedAt, completedHere: new Set() });
const keyFor = (storage, page, now, d = digest) => merchAttemptKey(storage, { digest: d, now, pageLoadedAt: page.pageLoadedAt, completedHere: page.completedHere, newKey });
const complete = (storage, page, key, now) => { page.completedHere.add(key); completeMerchAttempt(storage, key, now); };

// Only the digest is stored: no personal data in localStorage.
{
  const storage = memoryStorage();
  keyFor(storage, tab(t0), t0);
  const raw = storage.getItem(MERCH_ATTEMPT_STORAGE_NAME);
  for (const secret of ['Jordan', 'j@example.invalid', '0400000000', 'hoodie']) assert.ok(!raw.includes(secret), `stored record omits ${secret}`);
}

// Two tabs open; A submits, B submits the same order while A is in flight or after A finished: one key.
{
  const storage = memoryStorage();
  const a = tab(t0); const b = tab(t0 + 1_000);
  const keyA = keyFor(storage, a, t0 + 10_000);
  assert.equal(keyFor(storage, b, t0 + 11_000), keyA, 'second tab, in flight');
  complete(storage, a, keyA, t0 + 12_000);
  assert.equal(keyFor(storage, b, t0 + 20_000), keyA, 'second tab after success replays');
  complete(storage, b, keyA, t0 + 21_000);
  // Codex P1: B replaying must not make A's next deliberate order replay.
  assert.notEqual(keyFor(storage, a, t0 + 30_000), keyA, 'completing page places a deliberate repeat order');
  // ...and B, having also completed, starts fresh too.
  assert.notEqual(keyFor(storage, b, t0 + 31_000), keyA);
}

// Codex P1: a reload (page loaded after completion) places a deliberate repeat order.
{
  const storage = memoryStorage();
  const a = tab(t0);
  const keyA = keyFor(storage, a, t0 + 1_000);
  complete(storage, a, keyA, t0 + 2_000);
  assert.notEqual(keyFor(storage, tab(t0 + 3_000), t0 + 4_000), keyA, 'reloaded page starts fresh');
}

// Codex P2: a different order in another tab does not evict an in-flight attempt.
{
  const storage = memoryStorage();
  const keyX = keyFor(storage, tab(t0), t0 + 1_000);
  const other = await merchAttemptDigest(merchAttemptSignature({ ...order, customer_name: 'Casey Sample' }));
  const keyY = keyFor(storage, tab(t0), t0 + 2_000, other);
  assert.notEqual(keyY, keyX);
  assert.equal(keyFor(storage, tab(t0 + 3_000), t0 + 4_000), keyX, 'X (response lost, page reloaded) still replays');
  assert.equal(keyFor(storage, tab(t0), t0 + 5_000, other), keyY, 'Y still replays');
  // Completing X keeps Y's record intact (the lost-update case).
  completeMerchAttempt(storage, keyX, t0 + 6_000);
  assert.equal(keyFor(storage, tab(t0), t0 + 7_000, other), keyY);
  // Forgetting one leaves the other.
  forgetMerchAttempt(storage, keyY, t0 + 8_000);
  assert.notEqual(keyFor(storage, tab(t0), t0 + 9_000, other), keyY);
  assert.equal(keyFor(storage, tab(t0), t0 + 9_500), keyX);
}

// Different order: different key.
{
  const storage = memoryStorage();
  const a = tab(t0);
  const keyA = keyFor(storage, a, t0 + 1_000);
  const other = await merchAttemptDigest(merchAttemptSignature({ ...order, total_amount: 120 }));
  assert.notEqual(keyFor(storage, tab(t0), t0 + 2_000, other), keyA);
}

// Codex P2: records expire and are removed.
{
  const storage = memoryStorage();
  const k1 = keyFor(storage, tab(t0), t0);
  assert.notEqual(keyFor(storage, tab(t0), t0 + MERCH_ATTEMPT_TTL_MS), k1, 'expired key not reused');
  const s2 = memoryStorage();
  keyFor(s2, tab(t0), t0);
  pruneMerchAttempt(s2, t0 + MERCH_ATTEMPT_TTL_MS - 1);
  assert.ok(s2.getItem(MERCH_ATTEMPT_STORAGE_NAME), 'fresh record kept');
  pruneMerchAttempt(s2, t0 + MERCH_ATTEMPT_TTL_MS);
  assert.equal(s2.getItem(MERCH_ATTEMPT_STORAGE_NAME), null, 'expired record removed on load');
}

// At most 20 records are kept, newest first.
{
  const storage = memoryStorage();
  for (let i = 0; i < 25; i++) {
    const d = await merchAttemptDigest(`order-${i}`);
    keyFor(storage, tab(t0), t0 + i, d);
  }
  assert.equal(Object.keys(JSON.parse(storage.getItem(MERCH_ATTEMPT_STORAGE_NAME))).length, 20);
}

// A refused replay (changed or removed order) is forgotten; only the matching key is removed.
{
  const storage = memoryStorage();
  const k = keyFor(storage, tab(t0), t0);
  forgetMerchAttempt(storage, 'some-other-key', t0);
  assert.ok(storage.getItem(MERCH_ATTEMPT_STORAGE_NAME));
  forgetMerchAttempt(storage, k, t0);
  assert.equal(storage.getItem(MERCH_ATTEMPT_STORAGE_NAME), null);
}

// No storage, broken storage, garbage or no digest: a fresh key each attempt, no crash.
{
  assert.ok(keyFor(null, tab(t0), t0));
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.ok(keyFor(broken, tab(t0), t0));
  completeMerchAttempt(broken, 'x', t0); forgetMerchAttempt(broken, 'x', t0); pruneMerchAttempt(broken, t0);
  const garbage = memoryStorage(); garbage.setItem(MERCH_ATTEMPT_STORAGE_NAME, '{not json');
  assert.ok(keyFor(garbage, tab(t0), t0));
  const storage = memoryStorage();
  const k = keyFor(storage, tab(t0), t0, null);
  assert.equal(storage.getItem(MERCH_ATTEMPT_STORAGE_NAME), null, 'nothing shared without a digest');
  assert.notEqual(keyFor(storage, tab(t0), t0, null), k);
}

// Codex P2: the read-modify-write runs under a cross-tab Web Lock when available.
{
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let locked = '';
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: async (name, fn) => { locked = name; return fn(); } } } });
  assert.equal(await withMerchAttemptLock(() => 'inside'), 'inside');
  assert.equal(locked, 'ndcc-merch-order-attempt');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: async () => { throw new Error('denied'); } } } });
  assert.equal(await withMerchAttemptLock(() => 'fallback'), 'fallback', 'a failing lock still runs the task');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  assert.equal(await withMerchAttemptLock(() => 'unlocked'), 'unlocked');
  if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator;
}

// Wiring in the merchandise page.
const client = readFileSync('app/merchandise/MerchandiseClient.tsx', 'utf8');
// Codex P2: the load marker is the navigation start, not the (deferred) effect time.
assert.match(client, /pageLoadedAt\.current = typeof performance !== 'undefined' && performance\.timeOrigin \? Math\.floor\(performance\.timeOrigin\) : Date\.now\(\);/);
assert.match(client, /await merchAttemptDigest\(merchAttemptSignature\(orderPayload\)\)/);
assert.match(client, /await withMerchAttemptLock\(\(\) => merchAttemptKey\(attemptStorage\(\), \{/);
// Codex P2: every storage mutation runs under the same lock.
assert.match(client, /completedHere\.current\.add\(idempotencyKey\);\s*await withMerchAttemptLock\(\(\) => completeMerchAttempt\(attemptStorage\(\), idempotencyKey, Date\.now\(\)\)\)/);
assert.match(client, /await withMerchAttemptLock\(\(\) => forgetMerchAttempt\(attemptStorage\(\), idempotencyKey, Date\.now\(\)\)\)/);
assert.match(client, /withMerchAttemptLock\(\(\) => pruneMerchAttempt\(attemptStorage\(\), Date\.now\(\)\)\)/);
assert.equal((client.match(/(merchAttemptKey|completeMerchAttempt|forgetMerchAttempt|pruneMerchAttempt)\(attemptStorage/g) || []).length, 4);
assert.equal((client.match(/withMerchAttemptLock\(\(\) => (merchAttemptKey|completeMerchAttempt|forgetMerchAttempt|pruneMerchAttempt)\(/g) || []).length, 4);

console.log('PASS: merchandise order attempts - shared across open tabs, digest-only, expiring, locked, repeat orders allowed.');
