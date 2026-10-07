// Merchandise order attempts are shared across tabs: the same order submitted
// from a second tab reuses the first tab's idempotency key, so the server
// replays the original order instead of creating a duplicate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MERCH_ATTEMPT_STORAGE_NAME, MERCH_ATTEMPT_TTL_MS, completeMerchAttempt, forgetMerchAttempt, merchAttemptKey, merchAttemptSignature,
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
const order = { customer_name: 'Jordan Example', customer_email: 'j@example.invalid', items: [{ slug: 'hoodie', quantity: 1 }], total_amount: 60 };

// Anti-spam fields differ per page load and are not part of "the same order".
assert.equal(
  merchAttemptSignature({ ...order, submitted_at: 1, hp_field: '' }),
  merchAttemptSignature({ ...order, submitted_at: 999, hp_field: '' }),
);
assert.notEqual(merchAttemptSignature(order), merchAttemptSignature({ ...order, total_amount: 120 }));

const storage = memoryStorage();
const signature = merchAttemptSignature(order);
const t0 = 1_000_000;

// Tab A starts the order; tab B submits the same order and reuses the key.
const keyA = merchAttemptKey(storage, signature, 'tab-a', t0, newKey);
assert.equal(merchAttemptKey(storage, signature, 'tab-b', t0 + 5_000, newKey), keyA, 'second tab, in flight');

// Tab A succeeds: tab B still replays the same order; tab A's next identical order is new.
completeMerchAttempt(storage, keyA, 'tab-a');
assert.equal(merchAttemptKey(storage, signature, 'tab-b', t0 + 10_000, newKey), keyA, 'second tab after success');
const keyA2 = merchAttemptKey(storage, signature, 'tab-a', t0 + 20_000, newKey);
assert.notEqual(keyA2, keyA, 'a deliberate repeat order from the finishing tab is not swallowed');

// A different order gets a different key.
assert.notEqual(merchAttemptKey(storage, merchAttemptSignature({ ...order, total_amount: 120 }), 'tab-b', t0 + 30_000, newKey), keyA2);

// Memory expires after 30 minutes.
const fresh = memoryStorage();
const k1 = merchAttemptKey(fresh, signature, 'tab-a', t0, newKey);
assert.notEqual(merchAttemptKey(fresh, signature, 'tab-b', t0 + MERCH_ATTEMPT_TTL_MS, newKey), k1);

// A refused replay (changed or removed order) is forgotten; only the matching key is removed.
const s2 = memoryStorage();
const k2 = merchAttemptKey(s2, signature, 'tab-a', t0, newKey);
forgetMerchAttempt(s2, 'some-other-key');
assert.ok(s2.getItem(MERCH_ATTEMPT_STORAGE_NAME));
forgetMerchAttempt(s2, k2);
assert.equal(s2.getItem(MERCH_ATTEMPT_STORAGE_NAME), null);

// No storage (private mode) or broken storage: a fresh key each attempt, no crash.
assert.ok(merchAttemptKey(null, signature, 'tab-a', t0, newKey));
const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
assert.ok(merchAttemptKey(broken, signature, 'tab-a', t0, newKey));
completeMerchAttempt(broken, 'x', 'tab-a');
forgetMerchAttempt(broken, 'x');
const garbage = memoryStorage(); garbage.setItem(MERCH_ATTEMPT_STORAGE_NAME, '{not json');
assert.ok(merchAttemptKey(garbage, signature, 'tab-a', t0, newKey));

// Wiring in the merchandise page.
const client = readFileSync('app/merchandise/MerchandiseClient.tsx', 'utf8');
assert.match(client, /merchAttemptKey\(attemptStorage\(\), merchAttemptSignature\(orderPayload\), tabId\.current, Date\.now\(\), newKey\)/);
assert.match(client, /completeMerchAttempt\(attemptStorage\(\), idempotencyKey, tabId\.current\)/);
assert.match(client, /forgetMerchAttempt\(attemptStorage\(\), idempotencyKey\)/);

console.log('PASS: merchandise order attempts are shared across tabs (no second-tab duplicates).');
