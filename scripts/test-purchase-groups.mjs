#!/usr/bin/env node
// Unit tests for admin purchase grouping (lib/orders/purchase-groups.ts) with
// synthetic data. Regression: renaming an event split its orders across tabs.

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { purchaseGroup, purchaseGroupLabel, eventTitleMap } = await import(
  pathToFileURL(path.join(repoRoot, 'lib/orders/purchase-groups.ts')).href
);

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const titles = eventTitleMap([{ id: EVENT_ID, title: 'iPod Shuffle Night' }, { id: null, title: 'ignored' }, { id: 'x', title: '' }]);

// Orders placed before and after the rename land in the same group.
const before = { order_category: 'event', items: [{ name: 'iPod Shuffle', event_id: EVENT_ID }] };
const after = { order_category: 'event', items: [{ name: 'iPod Shuffle Night', event_id: EVENT_ID }] };
assert.equal(purchaseGroup(before, titles), 'event:iPod Shuffle Night');
assert.equal(purchaseGroup(after, titles), 'event:iPod Shuffle Night');
assert.equal(purchaseGroupLabel(purchaseGroup(before, titles)), 'iPod Shuffle Night');

// Without titles, or with an unknown event id, the stored name is the fallback.
assert.equal(purchaseGroup(before), 'event:iPod Shuffle');
assert.equal(purchaseGroup({ order_category: 'event', items: [{ name: 'Old', event_id: 'unknown' }] }, titles), 'event:Old');
assert.equal(purchaseGroup({ order_category: 'event', items: [{ name: 'Legacy' }] }, titles), 'event:Legacy');
assert.equal(purchaseGroup({ order_category: 'event', items: [] }, titles), 'event:Other events');
assert.equal(purchaseGroup({ order_category: 'event' }, titles), 'event:Other events');

// Non-event categories are unchanged.
assert.equal(purchaseGroup({ order_category: 'merch', items: [{ name: 'Tee Shirt', event_id: EVENT_ID }] }, titles), 'merch');
assert.equal(purchaseGroup({ order_category: null }), 'other');
assert.equal(purchaseGroupLabel('merch'), 'Apparel / merchandise');

// The map ignores rows without an id or title.
assert.equal(titles.size, 1);

console.log('purchase-groups tests passed');
