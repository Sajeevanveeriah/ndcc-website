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
  console.log('PASS public API cache: valid empty content, 30s CDN only, errors never cached');
})().catch(error => { console.error(error); process.exitCode = 1; });
