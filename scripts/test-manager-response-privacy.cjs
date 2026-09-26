const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const privateRecipients = ['committee-one@example.invalid', 'committee-two@example.invalid'];
const owner = { id: 'account-owner', email: 'member@example.invalid' };
let user = owner;
let manager = null;
let entry = null;
let season = { id: 'current-season' };
let managerError = null;
let entryError = null;
let settingsReads = 0;
const queries = [];
const deferred = [];

const db = {
  from(table) {
    const query = { table, filters: [] };
    queries.push(query);
    const builder = {
      select: () => builder,
      eq: (key, value) => { query.filters.push([key, value]); return builder; },
      maybeSingle: async () => {
        if (table === 'fantasy_managers') return { data: manager, error: managerError };
        if (table === 'fantasy_entries') return { data: entry, error: entryError };
        throw new Error(`Unexpected table: ${table}`);
      },
    };
    return builder;
  },
};
const mocks = {
  'next/server': { NextResponse: { json: Response.json }, after: callback => deferred.push(callback) },
  '@/lib/supabase-server': { createServerClient: () => db },
  '@/lib/fantasy-manager-auth': { getAuthUserFromRequest: async () => user },
  '@/lib/fantasy-seasons': { resolveRequestSeason: async () => season },
  '@/lib/dino-coach/server': { getDinoCoachSettings: async () => {
    settingsReads += 1;
    return { notification_recipients: privateRecipients };
  } },
  '@/lib/dino-coach/registration-email': { sendRegistrationEmail: () => {
    throw new Error('The test must not send email');
  } },
  '@/lib/server/fantasy-mutation': {},
  '@/lib/dino-coach/manager-eligibility': {},
  '@/lib/dino-coach/domain': {},
};
const route = {};
const code = ts.transpileModule(fs.readFileSync('app/api/fantasy/manager/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('require', 'exports', code)(name => {
  if (name in mocks) return mocks[name];
  throw new Error(`Unexpected import: ${name}`);
}, route);

async function readAccount() {
  return route.GET(new Request('https://example.invalid/api/fantasy/manager'));
}

(async () => {
  // A verified club account need not have joined Dino Coach to call this API.
  for (const hasManager of [false, true]) {
    manager = hasManager ? { id: 'own-manager', auth_user_id: owner.id, display_name: 'Test member' } : null;
    entry = hasManager ? { id: 'own-entry', status: 'paid', bank_transfer_selected_at: null } : null;
    queries.length = 0;
    const response = await readAccount();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.deepEqual(body.reactivationContacts, [], 'Internal notification recipients must not reach signed-in accounts');
    for (const recipient of privateRecipients) assert.ok(!JSON.stringify(body).includes(recipient));
    assert.deepEqual(Object.keys(body).sort(), ['entry', 'manager', 'reactivationContacts', 'success', 'user']);
    assert.deepEqual(body.manager, manager);
    assert.deepEqual(body.entry, entry);
    assert.deepEqual(body.user, { email: owner.email });
    assert.deepEqual(queries[0].filters, [['auth_user_id', owner.id]]);
    if (hasManager) assert.deepEqual(queries[1].filters, [['manager_id', manager.id], ['season_id', season.id]]);
  }
  assert.equal(settingsReads, 0, 'Reading a profile must not fetch internal notification recipients');
  assert.equal(deferred.length, 1, 'Existing welcome-email scheduling is preserved');

  season = null;
  const betweenSeasons = await (await readAccount()).json();
  assert.deepEqual(betweenSeasons.reactivationContacts, []);
  assert.equal(betweenSeasons.entry, null);
  assert.deepEqual(betweenSeasons.manager, manager);

  user = null;
  const beforeUnauthenticated = queries.length;
  assert.equal((await readAccount()).status, 401);
  assert.equal(queries.length, beforeUnauthenticated);
  user = owner;
  managerError = { message: 'test-only private database failure' };
  const failedProfile = await readAccount();
  assert.equal(failedProfile.status, 500);
  assert.ok(!(await failedProfile.text()).includes(managerError.message));
  managerError = null;
  season = { id: 'current-season' };
  entryError = { message: 'test-only private entry failure' };
  const failedEntry = await readAccount();
  assert.equal(failedEntry.status, 503);
  assert.ok(!(await failedEntry.text()).includes(entryError.message));
  console.log('PASS manager response privacy: club-only and Dino accounts, response compatibility, ownership, no-store, absent season and error paths');
})().catch(error => { console.error(error); process.exitCode = 1; });
