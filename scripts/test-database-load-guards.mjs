#!/usr/bin/env node
// Guards that keep a slow or restarting Supabase database from being
// overloaded by the website itself (5 Oct 2026 incident: Free-tier compute,
// 4-15 s queries, then a restart that returned 521 for five minutes).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// 1. Site chrome (header and footer): after a degraded read, reuse the last
//    snapshot for a short window instead of re-running ~10 queries per request.
const nav = read('lib/server/nav-visibility.ts');
assert.match(nav, /const DEGRADED_BACKOFF_MS = 20_000;/);
assert.match(nav, /if \(Date\.now\(\) < degradedUntil\) \{\s*const reuse = lastGoodSnapshot \?\? lastDegradedSnapshot;\s*if \(reuse\) return reuse;/, 'degraded window reuses a snapshot without querying');
assert.match(nav, /lastGoodSnapshot = snapshot;\s*return snapshot;/, 'good snapshots are remembered');
assert.match(nav, /degradedUntil = Date\.now\(\) \+ DEGRADED_BACKOFF_MS;\s*lastDegradedSnapshot = uncachedResult;\s*return lastGoodSnapshot \?\? uncachedResult;/, 'a degraded read starts the backoff and prefers the last good snapshot');
assert.match(nav, /throw new DegradedSnapshotError\(\)/, 'degraded snapshots are still never written to the shared cache');

// 2. PlayHQ: a failed read is never cached for the 5-minute window.
const playhq = read('lib/playhq/client.ts');
assert.match(playhq, /if \(data\.error\) throw new PlayHQDegradedError\(data\);/);
assert.match(playhq, /if \(error instanceof PlayHQDegradedError\) return error\.data;/);
assert.doesNotMatch(playhq, /export const getPlayHQPublicData = unstable_cache\(getPlayHQPublicDataUncached/, 'the raw function (which returns failures) is not cached directly');

// 3. No Supabase realtime postgres_changes subscriptions: they keep the
//    database change poller running constantly on the small compute tier.
const wallet = read('app/fantasy/_components/WalletPanel.tsx');
assert.doesNotMatch(wallet, /postgres_changes|\.channel\(/);
assert.match(wallet, /setInterval\(\(\) => \{ if\(document\.visibilityState === 'visible'\) void refresh\(\); \}, 15000\)/, 'the wallet still refreshes while visible');

console.log('PASS database load guards: site chrome backoff, PlayHQ failures uncached, no realtime polling');
