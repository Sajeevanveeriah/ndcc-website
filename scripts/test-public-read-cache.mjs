import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPublicReadCacheState, withPublicReadCache } from '../lib/server/public-read-cache.ts';
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

await check('the timeout fetch does not replay a read that hit its own time budget', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (input, init) => {
    calls += 1;
    return new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')));
    });
  };
  try {
    await assert.rejects(createTimeoutFetch(20, true)(URL_A), /aborted/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await check('public reads replay a timed-out read once on a fresh request', async () => {
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
    const response = await createTimeoutFetch(20, true, { retryAfterTimeout: true })(URL_A);
    assert.deepEqual(await response.json(), { recovered: true });
    assert.equal(calls, 2);
    calls = 0;
    await assert.rejects(createTimeoutFetch(20, true, { retryAfterTimeout: true })(URL_A, { method: 'POST', body: '{}' }), /aborted/);
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

await check('only public read clients split their budget and replay after a timeout', async () => {
  const source = readFileSync(new URL('../lib/supabase-server.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('createTimeoutFetch(Math.ceil(totalTimeoutMs / 2), true, { retryAfterTimeout: true })'));
  assert.ok(source.includes(': createTimeoutFetch(timeoutMs, options.retryReads)'));
  assert.equal((source.match(/retryAfterTimeout: true/g) || []).length, 1);
});

await check('payment, checkout and availability reads do not opt into the public read cache', async () => {
  for (const path of ['lib/raffle-visibility.ts', 'app/api/raffle/numbers/route.ts', 'app/api/raffle/checkout/route.ts', 'lib/apparel/public-catalogue.ts', 'lib/public-kitchen.ts']) {
    assert.ok(!readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').includes('publicReadCache'), path);
  }
});

if (failures > 0) {
  console.error(`${failures} public read cache check(s) failed.`);
  process.exit(1);
}
console.log('All public read cache checks passed.');
