const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
let enabled = true;
let settingsFail = false;
let round;
const writes = [];
const mocks = {
  '@/lib/admin-client': {
    parseApiResponse: async result => result,
    adminFetch: async (url, init) => {
      if (url.endsWith('/deadline-editor-settings')) {
        if (settingsFail) throw new Error('Test settings unavailable');
        return { enabled };
      }
      assert.equal(url, '/api/admin/resources/fantasyRounds');
      if (init?.method === 'PATCH') {
        writes.push(JSON.parse(init.body));
        return { data: { ...round, ...writes.at(-1) } };
      }
      return { data: [round] };
    },
  },
};
const modules = new Map();
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} };
  modules.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', 'document', 'window', code)(name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(file), name);
      return load([base + '.ts', base + '.tsx', base].find(fs.existsSync));
    }
    return require(name);
  }, module, module.exports, { body: { style: {} }, addEventListener() {}, removeEventListener() {} }, {});
  return module.exports;
}
const Page = load('app/admin/fantasy/rounds/page.tsx').default;
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
async function editAndSave(saved, expectedValue, expectedSaved, invalidValue) {
  round = { id: 'test-round', round_number: 1, name: 'Test round', status: 'open', deadline_at: saved };
  let view;
  await act(async () => { view = create(React.createElement(Page)); });
  try {
    const edit = view.root.findAllByType('button').find(button => text(button) === '');
    assert.ok(edit, 'Round edit button exists');
    await act(async () => edit.props.onClick());
    const input = view.root.findByProps({ id: 'fantasy-round-deadline', type: 'datetime-local' });
    assert.equal(input.props.value, expectedValue, 'The deadline editor must show the expected wall-clock time');
    if (invalidValue) await act(async () => input.props.onChange({ target: { value: invalidValue } }));
    const save = view.root.findAllByType('button').find(button => text(button) === 'Save Round');
    const previousWrites = writes.length;
    await act(async () => save.props.onClick());
    if (invalidValue) {
      assert.equal(writes.length, previousWrites, 'A nonexistent DST time cannot be saved');
      assert.match(text(view.root), /Choose a valid Melbourne date and time/);
      return;
    }
    assert.equal(writes.at(-1).deadline_at, expectedSaved, 'An unchanged deadline must not shift on save');
    assert.deepEqual(Object.keys(writes.at(-1)).sort(), ['deadline_at', 'id', 'name', 'round_number', 'status']);
  } finally {
    await act(async () => view.unmount());
  }
}

(async () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const zone of ['Australia/Melbourne', 'UTC', 'America/New_York']) {
      process.env.TZ = zone;
      await editAndSave('2026-09-26T00:00:00.000Z', '2026-09-26T10:00', '2026-09-26T00:00:00.000Z');
      await editAndSave('2026-10-09T23:00:00.000Z', '2026-10-10T10:00', '2026-10-09T23:00:00.000Z');
      await editAndSave(null, '', null);
    }
    await editAndSave('2026-09-26T00:00:00.000Z', '2026-09-26T10:00', null, '2026-10-04T02:30');
    process.env.TZ = 'Australia/Melbourne';
    enabled = false;
    await editAndSave('2026-09-26T00:00:00.000Z', '2026-09-26T00:00', '2026-09-25T14:00:00.000Z');
    settingsFail = true;
    enabled = true;
    await editAndSave('2026-09-26T00:00:00.000Z', '2026-09-26T00:00', '2026-09-25T14:00:00.000Z');
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
  // Execute the real switch endpoint with isolated authorisation/database fixtures.
  let authorised = false;
  let flag = true;
  let dbError = null;
  let throws = false;
  let dbReads = 0;
  mocks['next/server'] = { NextResponse: { json: Response.json } };
  mocks['@/lib/auth/guard'] = { requirePermission: async permission => {
    assert.equal(permission, 'fantasy.home');
    return authorised ? { id: 'test-admin' } : null;
  } };
  mocks['@/lib/supabase-server'] = { createServerClient: () => ({ from: table => {
    assert.equal(table, 'club_settings');
    dbReads += 1;
    const query = {
      select: field => { assert.equal(field, 'fantasy_melbourne_deadlines_enabled'); return query; },
      eq: (key, value) => { assert.deepEqual([key, value], ['id', 'default']); return query; },
      maybeSingle: async () => {
        if (throws) throw new Error('Test database unavailable');
        return { data: { fantasy_melbourne_deadlines_enabled: flag }, error: dbError };
      },
    };
    return query;
  } }) };
  const route = load('app/api/admin/fantasy/deadline-editor-settings/route.ts');
  assert.equal((await route.GET()).status, 403);
  assert.equal(dbReads, 0);
  authorised = true;
  for (const value of [true, false, null, undefined, 'true']) {
    flag = value;
    const response = await route.GET();
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { success: true, enabled: value === true });
  }
  flag = true;
  dbError = { message: 'Column missing' };
  assert.equal((await (await route.GET()).json()).enabled, false);
  dbError = null;
  throws = true;
  assert.equal((await (await route.GET()).json()).enabled, false);
  console.log('PASS fantasy deadline editor: AEST/AEDT round trips in three browser timezones, DST gap, empty deadline, legacy flag-off, authenticated switch and database failures');
})().catch(error => { console.error(error); process.exitCode = 1; });
