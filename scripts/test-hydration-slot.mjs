// The root layout must not put the page slot directly inside <main>: when the
// slot's client code loads after hydration starts, React replays the waiting
// host element and fails hydration (#418). HydrationSlot keeps a component in between.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layout = readFileSync('app/layout.tsx', 'utf8');
assert.match(layout, /<main id="main-content"[^>]*><MaintenanceBannerSpacer \/><HydrationSlot>\{children\}<\/HydrationSlot><\/main>/);
const slot = readFileSync('components/layout/HydrationSlot.tsx', 'utf8');
assert.match(slot, /^'use client';/);
assert.match(slot, /return children;/);
console.log('PASS: the page slot is wrapped in HydrationSlot inside <main>.');
