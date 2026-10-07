const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function loadRoute(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', code)(name => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    return mocks[name];
  }, exports);
  return exports;
}

(async () => {
  let degraded = false;
  const calendar = loadRoute('app/api/public/calendar/ics/route.ts', {
    '@/lib/calendar/queries': { getPublicCalendarEvents: async () => ({ data: [], degraded }) },
  });
  let response = await calendar.GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/calendar/);
  assert.equal(response.headers.get('vercel-cdn-cache-control'), 'public, s-maxage=30');
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.match(await response.text(), /BEGIN:VCALENDAR/);
  degraded = true;
  response = await calendar.GET();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('vercel-cdn-cache-control'), null);
  assert.match(response.headers.get('cache-control'), /no-store/);

  let failure = false;
  const appointments = loadRoute('app/api/public/season-appointments/route.ts', {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/public-season-appointments': { getPublicSeasonAppointments: async () => {
      if (failure) throw new Error('unavailable');
      return [];
    } },
  });
  response = await appointments.GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: [] });
  assert.equal(response.headers.get('vercel-cdn-cache-control'), 'public, s-maxage=30');
  failure = true;
  response = await appointments.GET();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('vercel-cdn-cache-control'), null);
  assert.match(response.headers.get('cache-control'), /no-store/);

  // Shared policy (lib/server/public-cdn-cache.ts) used by the other public reads.
  const cdn = loadRoute('lib/server/public-cdn-cache.ts', {});
  const CDN = 'public, s-maxage=30, stale-while-revalidate=120';
  assert.equal(cdn.PUBLIC_CDN_CACHE_CONTROL, CDN);
  const base = { 'next/server': { NextResponse: { json: Response.json } }, '@/lib/server/public-cdn-cache': cdn };
  function expectCached(res, label) {
    assert.equal(res.status, 200, label);
    assert.equal(res.headers.get('vercel-cdn-cache-control'), CDN, `${label}: CDN cached`);
    assert.match(res.headers.get('cache-control'), /no-store/, `${label}: browser still no-store`);
  }
  function expectUncached(res, label) {
    assert.equal(res.headers.get('vercel-cdn-cache-control'), null, `${label}: never CDN cached`);
    assert.match(res.headers.get('cache-control') || '', /no-store/, `${label}: no-store`);
  }
  const req = (url) => new Request(`https://www.ndcc.com.au${url}`);
  const live = { data: [{ id: 'a' }], error: null, source: 'supabase', degraded: false };
  const down = { data: [{ id: 'fallback' }], error: 'boom', source: 'fallback', degraded: true };
  const quietly = async (fn) => {
    const orig = console.error; console.error = () => {};
    try { return await fn(); } finally { console.error = orig; }
  };

  // Result-object routes: gallery, sponsors, events.
  for (const [path, fn] of [
    ['app/api/gallery/route.ts', 'getPublicGallery'],
    ['app/api/public/sponsors/route.ts', 'getPublicSponsors'],
    ['app/api/public/events/route.ts', 'getPublicEvents'],
  ]) {
    let result = live;
    const route = loadRoute(path, { ...base, '@/lib/public-data': { [fn]: async () => result } });
    expectCached(await route.GET(req('/x')), `${path} live`);
    result = down;
    expectUncached(await route.GET(req('/x')), `${path} degraded`);
  }
  {
    const events = loadRoute('app/api/public/events/route.ts', { ...base, '@/lib/public-data': { getPublicEvents: async () => live } });
    const missing = await events.GET(req('/api/public/events?id=nope'));
    assert.equal(missing.status, 404);
    expectUncached(missing, 'events 404');
    expectCached(await events.GET(req('/api/public/events?id=a')), 'events by id');
  }

  // Club settings: the shared fallback object means a failed/unconfigured read.
  {
    const fallbackClubSettings = { id: 'default', club_name: 'fallback' };
    let data = { id: 'default', club_name: 'live' };
    const route = loadRoute('app/api/club-settings/route.ts', {
      ...base,
      '@/lib/club-settings': { getClubSettings: async () => data },
      '@/lib/club-settings-types': { fallbackClubSettings },
    });
    expectCached(await route.GET(), 'club-settings live');
    data = fallbackClubSettings;
    expectUncached(await route.GET(), 'club-settings fallback');
  }

  // Committee: the shared fallback list means a failed read.
  {
    const fallbackCommitteeMembers = [];
    let mode = 'live';
    const route = loadRoute('app/api/public/committee/route.ts', {
      ...base,
      '@/lib/fallback-content': { fallbackCommitteeMembers },
      '@/lib/structured-content': { getCommitteeMembers: async () => {
        if (mode === 'throw') throw new Error('down');
        return mode === 'live' ? [{ id: 'm' }] : fallbackCommitteeMembers;
      } },
    });
    expectCached(await route.GET(), 'committee live');
    mode = 'fallback';
    expectUncached(await route.GET(), 'committee fallback');
    mode = 'throw';
    const res = await quietly(() => route.GET());
    assert.equal(res.status, 500);
    expectUncached(res, 'committee error');
  }

  // Calendar JSON feeds: 503 on degraded, never cached.
  for (const [path, fn] of [
    ['app/api/public/calendar/route.ts', 'getPublicCalendarEvents'],
    ['app/api/public/calendar/upcoming/route.ts', 'getUpcomingCalendarEvents'],
  ]) {
    let degradedCal = false;
    const route = loadRoute(path, {
      ...base,
      '@/lib/calendar/queries': { [fn]: async () => ({ data: [], degraded: degradedCal }), parseCalendarTypes: () => [] },
      '@/lib/calendar/format': { toCalendarFeedEvent: (e) => e },
    });
    expectCached(await route.GET(req('/api/public/calendar')), `${path} live`);
    degradedCal = true;
    const res = await route.GET(req('/api/public/calendar'));
    assert.equal(res.status, 503);
    expectUncached(res, `${path} degraded`);
  }

  // Club season: a successful read (even "no current season") is cached; a failure is not.
  {
    let fail = false;
    const route = loadRoute('app/api/public/club-season/route.ts', {
      ...base,
      '@/lib/club-seasons': { getCurrentClubSeason: async () => { if (fail) throw new Error('down'); return null; } },
    });
    expectCached(await route.GET(), 'club-season live');
    fail = true;
    const res = await route.GET();
    assert.equal(res.status, 503);
    expectUncached(res, 'club-season error');
  }

  // Player registration: null may hide a swallowed failure, so only data is cached.
  {
    let data = { id: 'r' };
    const route = loadRoute('app/api/public/player-registration/route.ts', {
      ...base,
      '@/lib/public-player-registration': { getPublicPlayerRegistration: async () => data },
    });
    expectCached(await route.GET(), 'player-registration live');
    data = null;
    expectUncached(await route.GET(), 'player-registration null');
  }

  // Site links: fallback ids, empty lists and bad sections are never cached.
  {
    let data = [{ id: 'live-1' }];
    const route = loadRoute('app/api/public/site-links/route.ts', {
      ...base,
      '@/lib/structured-content': { getPageLinkCards: async () => data },
    });
    const url = '/api/public/site-links?section=header_nav';
    expectCached(await route.GET(req(url)), 'site-links live');
    data = [{ id: 'fallback-x' }];
    expectUncached(await route.GET(req(url)), 'site-links fallback');
    data = [];
    expectUncached(await route.GET(req(url)), 'site-links empty');
    const bad = await route.GET(req('/api/public/site-links?section=nope'));
    assert.equal(bad.status, 400);
    expectUncached(bad, 'site-links 400');
  }

  // News: live reads cached; seed fallback, 404 and query failure are not.
  {
    const saved = { NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
    let mode = 'live';
    const route = loadRoute('app/api/public/news/route.ts', {
      ...base,
      '@/lib/fallback-content': { fallbackNews: [{ id: 'seed' }] },
      '@/lib/public-news': { getPublishedNews: async ({ id }) => {
        if (mode === 'throw') throw new Error('down');
        if (id === 'missing') return null;
        return id ? { id } : [{ id: 'n1' }];
      } },
    });
    try {
      expectCached(await route.GET(req('/api/public/news')), 'news list');
      expectCached(await route.GET(req('/api/public/news?id=n1')), 'news item');
      const missing = await route.GET(req('/api/public/news?id=missing'));
      assert.equal(missing.status, 404);
      expectUncached(missing, 'news 404');
      mode = 'throw';
      expectUncached(await route.GET(req('/api/public/news')), 'news failure fallback');
      mode = 'live';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      expectUncached(await route.GET(req('/api/public/news')), 'news unconfigured fallback');
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  }

  // /api/content-blocks: only the live page query is cached; the keys branch
  // (draft-preview aware, folds failures into fallbacks) never is.
  {
    let configured = true;
    let queryError = null;
    const query = {
      eq() { return query; }, in() { return query; }, order() { return query; },
      then(resolve) { resolve({ data: queryError ? null : [{ block_key: 'home.a', cta_url: null }], error: queryError }); },
    };
    const route = loadRoute('app/api/content-blocks/route.ts', {
      ...base,
      '@/lib/supabase-server': { isServerSupabaseConfigured: () => configured, createServerClient: () => ({ from: () => ({ select: () => query }) }) },
      '@/lib/content-blocks': { getContentBlocks: async () => ({ 'home.a': { block_key: 'home.a' } }) },
      '@/lib/fallback-content': { fallbackContentBlocks: { a: { block_key: 'home.a' } } },
      '@/lib/public-link-url': { normalisePublicLinkUrl: (v) => v ?? null },
    });
    expectCached(await route.GET(req('/api/content-blocks?page=home')), 'content-blocks page live');
    expectUncached(await route.GET(req('/api/content-blocks?keys=home.a')), 'content-blocks keys');
    queryError = { code: 'X', message: 'down' };
    expectUncached(await quietly(() => route.GET(req('/api/content-blocks?page=home'))), 'content-blocks page error');
    queryError = null;
    configured = false;
    expectUncached(await route.GET(req('/api/content-blocks?page=home')), 'content-blocks unconfigured');
  }

  // Public routes deliberately left uncached (see the commit message for reasons).
  for (const path of [
    'app/api/public/maintenance-banner/route.ts',
    'app/api/public/raffle-status/route.ts',
    'app/api/public/dino-coach-status/route.ts',
    'app/api/public/content-blocks/route.ts',
  ]) {
    assert.doesNotMatch(fs.readFileSync(path, 'utf8'), /Vercel-CDN-Cache-Control|withPublicCdnCache/, `${path} must stay uncached`);
  }

  console.log('PASS public API cache: valid empty content, 30s CDN only, errors never cached');
})().catch(error => { console.error(error); process.exitCode = 1; });
