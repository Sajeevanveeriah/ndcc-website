import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPublicReadCacheState, withPublicReadCache, PUBLIC_READ_MAX_BYTES } from '../lib/server/public-read-cache.ts';
import { createTimeoutFetch } from '../lib/server/timeout-fetch.ts';

let failures = 0;
async function check(label, fn) {
  try {
    await fn();
    console.log(`PASS ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${label}: ${error instanceof Error ? error.message : error}`);
  }
}

function harness(responder) {
  let clock = 1_000;
  let calls = 0;
  const upstream = async (input, init) => {
    calls += 1;
    return responder(calls, input, init);
  };
  const fetchImpl = withPublicReadCache(upstream, {
    scope: 'test',
    state: createPublicReadCacheState(),
    now: () => clock,
    freshMs: 5_000,
    staleMs: 60_000,
  });
  return {
    fetchImpl,
    get calls() { return calls; },
    advance(ms) { clock += ms; },
  };
}

const URL_A = 'https://example.supabase.co/rest/v1/club_settings?select=*';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

await check('identical concurrent reads share one upstream request', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const h = harness(async () => { await gate; return json([{ id: 'default' }]); });
  const pending = Array.from({ length: 25 }, () => h.fetchImpl(URL_A, { headers: { accept: 'application/json' } }));
  release();
  const bodies = await Promise.all(pending.map(async (p) => (await p).json()));
  assert.equal(h.calls, 1);
  assert.equal(bodies.length, 25);
  for (const body of bodies) assert.deepEqual(body, [{ id: 'default' }]);
});

await check('a fresh response is reused, then re-read after the fresh window', async () => {
  const h = harness((n) => json({ n }));
  assert.deepEqual(await (await h.fetchImpl(URL_A)).json(), { n: 1 });
  h.advance(4_000);
  assert.deepEqual(await (await h.fetchImpl(URL_A)).json(), { n: 1 });
  h.advance(2_000);
  assert.deepEqual(await (await h.fetchImpl(URL_A)).json(), { n: 2 });
  assert.equal(h.calls, 2);
});

await check('the last good response is served when the upstream read times out', async () => {
  const h = harness((n) => {
    if (n === 1) return json({ live: true });
    throw new DOMException('This operation was aborted', 'AbortError');
  });
  await (await h.fetchImpl(URL_A)).json();
  h.advance(30_000);
  const response = await h.fetchImpl(URL_A);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { live: true });
});

await check('the last good response is served on an upstream 5xx; too-old copies are not', async () => {
  const h = harness((n) => (n === 1 ? json({ live: true }) : json({ message: 'down' }, 503)));
  await (await h.fetchImpl(URL_A)).json();
  h.advance(30_000);
  assert.deepEqual(await (await h.fetchImpl(URL_A)).json(), { live: true });
  h.advance(61_000);
  const response = await h.fetchImpl(URL_A);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { message: 'down' });
});

await check('errors without a good copy reach every caller and are never stored', async () => {
  const h = harness((n) => {
    if (n === 1) throw new TypeError('fetch failed');
    return json({ recovered: true });
  });
  const results = await Promise.allSettled([h.fetchImpl(URL_A), h.fetchImpl(URL_A)]);
  assert.deepEqual(results.map((r) => r.status), ['rejected', 'rejected']);
  assert.equal((await h.fetchImpl(URL_A)).status, 503, 'cold failures cool down without caching an error body');
  assert.equal(h.calls, 1);
  h.advance(30_001);
  assert.deepEqual(await (await h.fetchImpl(URL_A)).json(), { recovered: true });
  assert.equal(h.calls, 2);
});

await check('non-GET requests always pass straight through', async () => {
  const h = harness((n) => json({ n }));
  await h.fetchImpl(URL_A, { method: 'POST', body: '{}' });
  await h.fetchImpl(URL_A, { method: 'PATCH', body: '{}' });
  assert.equal(h.calls, 2);
});

await check('different URLs, profiles and Prefer headers are cached separately', async () => {
  const h = harness((n) => json({ n }));
  await h.fetchImpl(URL_A);
  await h.fetchImpl(`${URL_A}&id=eq.default`);
  await h.fetchImpl(URL_A, { headers: { prefer: 'count=exact' } });
  await h.fetchImpl(URL_A, { headers: { 'accept-profile': 'other' } });
  assert.equal(h.calls, 4);
});

await check('opted-in reads are replayed once after a timeout; writes never are', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (input, init) => {
    calls += 1;
    if (calls === 2) return Promise.resolve(json({ recovered: true }));
    return new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')));
    });
  };
  try {
    const response = await createTimeoutFetch(20, true)(URL_A);
    assert.deepEqual(await response.json(), { recovered: true });
    assert.equal(calls, 2);
    calls = 0;
    await assert.rejects(createTimeoutFetch(20, true)(URL_A, { method: 'POST', body: '{}' }), /aborted/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await check('the timeout fetch still retries a read once after a network failure', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('fetch failed');
    return json({ ok: true });
  };
  try {
    const response = await createTimeoutFetch(1_000, true)(URL_A);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await check('public read clients get at least 10 s per attempt plus a retry', async () => {
  const source = readFileSync(new URL('../lib/supabase-server.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('const PUBLIC_READ_ATTEMPT_MS = 10_000;'));
  assert.ok(source.includes('createTimeoutFetch(Math.max(timeoutMs, PUBLIC_READ_ATTEMPT_MS), true)'));
});

await check('build prerender reads get one bounded attempt so an unreachable database cannot fail the build', async () => {
  const source = readFileSync(new URL('../lib/supabase-server.ts', import.meta.url), 'utf8');
  assert.ok(source.includes("const IS_BUILD_PRERENDER = process.env.NEXT_PHASE === 'phase-production-build';"));
  assert.ok(source.includes('const BUILD_READ_ATTEMPT_MS = 4_000;'));
  assert.ok(source.includes('if (IS_BUILD_PRERENDER) return createTimeoutFetch(BUILD_READ_ATTEMPT_MS, false);'));
  assert.ok(source.includes('const timeoutMs = IS_BUILD_PRERENDER ? Math.min(requestedTimeoutMs, BUILD_READ_ATTEMPT_MS) : requestedTimeoutMs;'));
  assert.ok(source.includes('createTimeoutFetch(timeoutMs, !IS_BUILD_PRERENDER && (options.retryReads ?? true))'));
  assert.match(readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8'), /staticPageGenerationTimeout: 180,/);
});

await check('payment, checkout and availability reads do not opt into the public read cache', async () => {
  for (const path of ['lib/raffle-visibility.ts', 'app/api/raffle/numbers/route.ts', 'app/api/raffle/checkout/route.ts', 'lib/apparel/public-catalogue.ts', 'lib/public-kitchen.ts']) {
    assert.ok(!readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').includes('publicReadCache'), path);
  }
});

await check('a stalled JSON body is bounded and retried once; caller cancellation is not retried', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    if (calls === 2) return json({ recoveredBody: true });
    return new Response(new ReadableStream({ start(controller) {
      init.signal.addEventListener('abort', () => controller.error(new DOMException('Body aborted', 'AbortError')), { once: true });
    } }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    assert.deepEqual(await (await createTimeoutFetch(20, true)(URL_A)).json(), { recoveredBody: true });
    assert.equal(calls, 2);
    calls = 0;
    const caller = new AbortController();
    const pending = createTimeoutFetch(1000, true)(URL_A, { signal: caller.signal });
    await Promise.resolve();
    caller.abort();
    await assert.rejects(pending, /Body aborted/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});


await check('outage cooldown serves last good content without more upstream calls, then probes once', async () => {
  let recover = false;
  const h = harness(n => n === 1 || recover ? json({ n }) : json({ message: 'unavailable' }, 503));
  await h.fetchImpl(URL_A);
  h.advance(6_000);
  assert.deepEqual(await (await h.fetchImpl(URL_A)).json(), { n: 1 });
  for (let i = 0; i < 50; i++) assert.deepEqual(await (await h.fetchImpl(URL_A)).json(), { n: 1 });
  assert.equal(h.calls, 2, '50 outage reads do not trigger 50 retry pairs');
  recover = true;
  h.advance(30_001);
  const responses = await Promise.all(Array.from({ length: 20 }, () => h.fetchImpl(URL_A)));
  assert.equal(h.calls, 3, 'one recovery probe is shared');
  assert.deepEqual(await responses[0].json(), { n: 3 });
});

await check('permission failures never serve or retain old public data', async () => {
  const h = harness(n => n === 1 ? json({ sensitive: 'removed' }) : json({ message: 'forbidden' }, 403));
  await h.fetchImpl(URL_A);
  h.advance(6_000);
  assert.equal((await h.fetchImpl(URL_A)).status, 403);
  assert.equal((await h.fetchImpl(URL_A)).status, 403);
  assert.equal(h.calls, 3);
});

await check('successful empty data replaces the old response', async () => {
  const h = harness(n => json(n === 1 ? [{ id: 'unpublished' }] : []));
  await h.fetchImpl(URL_A);
  h.advance(6_000);
  assert.deepEqual(await (await h.fetchImpl(URL_A)).json(), []);
  assert.deepEqual(await (await h.fetchImpl(URL_A)).json(), []);
  assert.equal(h.calls, 2);
});

await check('retained response bytes and outage keys are bounded', async () => {
  const state = createPublicReadCacheState();
  const cached = withPublicReadCache(async () => new Response('x'.repeat(900_000)), { scope: 'budget', state });
  for (let i = 0; i < 25; i++) await cached(`${URL_A}&row=${i}`);
  assert.ok(state.bytes <= PUBLIC_READ_MAX_BYTES);
  assert.equal(state.bytes, [...state.entries.values()].reduce((n, row) => n + row.body.byteLength, 0));
  assert.ok(!state.entries.has(`budget ${URL_A}&row=0 accept=&accept-profile=&prefer=&range=`));
  const failing = withPublicReadCache(async () => json({}, 503), { scope: 'failure-budget', state });
  for (let i = 0; i < 350; i++) await failing(`${URL_A}&failure=${i}`);
  assert.ok(state.retryAfter.size <= 300);
});

await check('caller abort during retry backoff prevents a second request', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const caller = new AbortController();
  globalThis.fetch = async () => { calls++; setTimeout(() => caller.abort(), 20); return json({}, 503); };
  try {
    await assert.rejects(createTimeoutFetch(1_000, true)(URL_A, { signal: caller.signal }), /aborted/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

if (failures > 0) {
  console.error(`${failures} public read cache check(s) failed.`);
  process.exit(1);
}
console.log('All public read cache checks passed.');
