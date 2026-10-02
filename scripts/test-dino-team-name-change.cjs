// Dino Coach managers can rename their own team from My Dino Coach account.
// Covers the rename route (auth, validation, lock, deleted teams, blocked
// terms refused without publishing, concurrent-change guard, moderation log,
// standings revalidation), the profile route refusing flagged renames, and the
// real React editor on the account page.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

class NextResponse extends Response { static json(body, init) { return new Response(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } }); } }

function load(file, mocks = {}, jsx = false) {
  const resolved = ['', '.ts', '.tsx'].map(ext => file + ext).find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!resolved) throw new Error(`Cannot resolve ${file}`);
  const exports = {}; const module = { exports };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(resolved, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, {
    exports, module, console, Request, Response, Headers, URL, Date, JSON, Error, process: { env: {} },
    require(name) {
      if (name in mocks) return mocks[name];
      if (name === 'server-only') return {};
      if (name.startsWith('@/')) return load(path.resolve(name.slice(2)), mocks, jsx);
      if (name.startsWith('.')) return load(path.resolve(path.dirname(resolved), name), mocks, jsx);
      return require(name);
    },
  }, { filename: resolved });
  return module.exports;
}

const original = { id: 'manager-1', auth_user_id: 'user-1', team_name: 'Old XI', team_name_status: 'approved', team_name_locked: false, deleted_at: null };
let manager = { ...original }, user = { id: 'user-1', email: 'coach@example.invalid' }, limited = false, fault = false, season = { id: 'season-1' };
let writes = [], logs = [], revalidations = 0, concurrentRename = false;
const db = { from(table) {
  if (table === 'fantasy_team_name_moderation') return { insert: row => { logs.push(row); return Promise.resolve({ error: null }); } };
  assert.equal(table, 'fantasy_managers');
  const predicates = []; let update;
  const q = {
    select: () => q,
    eq: (k, v) => { predicates.push(row => row[k] === v); return q; },
    is: (k, v) => { predicates.push(row => row[k] === v); return q; },
    update: value => { update = value; return q; },
    maybeSingle: async () => {
      if (fault) return { data: null, error: { message: 'private db error' } };
      if (update && concurrentRename) manager = { ...manager, team_name: 'Committee XI', team_name_locked: true };
      if (!manager || !predicates.every(fn => fn(manager))) return { data: null, error: null };
      if (update) { writes.push(update); manager = { ...manager, ...update }; }
      return { data: { ...manager }, error: null };
    },
  };
  return q;
} };
const mocks = {
  'next/server': { NextResponse },
  '@/lib/supabase-server': { createServerClient: () => db },
  '@/lib/fantasy-manager-auth': { getAuthUserFromRequest: async () => user },
  '@/lib/server/fantasy-mutation': { readFantasyMutation: async request => limited ? { response: NextResponse.json({ success: false }, { status: 429 }) } : { body: await request.json() } },
  '@/lib/fantasy-seasons': { resolveRequestSeason: async () => season },
  '@/lib/dino-coach/server': { getDinoCoachSettings: async () => ({ blocked_team_name_terms: ['badword'] }) },
  '@/lib/server/revalidate-public': { revalidateDinoStandingsCache: () => { revalidations++; } },
};
const route = load('app/api/fantasy/manager/team-name/route.ts', mocks);
const rename = async teamName => { const response = await route.POST(new Request('https://example.invalid/api/fantasy/manager/team-name', { method: 'POST', body: JSON.stringify({ teamName }) })); return { status: response.status, body: await response.json(), cache: response.headers.get('Cache-Control') }; };
const reset = (patch = {}) => { manager = { ...original, ...patch }; writes = []; logs = []; revalidations = 0; concurrentRename = false; fault = false; limited = false; };

(async () => {
  // Route
  user = null;
  assert.equal((await rename('New XI')).status, 401, 'sign-in required');
  user = { id: 'user-1', email: 'coach@example.invalid' };
  limited = true; assert.equal((await rename('New XI')).status, 429, 'shares the profile rate limit'); limited = false;
  assert.equal((await rename('   ')).status, 400);
  assert.equal((await rename(42)).status, 400);
  assert.equal((await rename('x'.repeat(81))).status, 400);
  assert.equal(writes.length, 0);

  let result = await rename('  Dino   Dynamos  ');
  assert.equal(result.status, 200);
  assert.equal(result.cache, 'no-store');
  assert.equal(manager.team_name, 'Dino Dynamos', 'whitespace normalised');
  assert.equal(manager.team_name_status, 'approved');
  assert.deepEqual(Object.keys(writes[0]).sort(), ['team_name', 'team_name_status'], 'only the team name changes');
  assert.equal(logs.length, 1);
  assert.deepEqual([logs[0].manager_id, logs[0].submitted_name, logs[0].resulting_name, logs[0].status], ['manager-1', 'Dino Dynamos', 'Dino Dynamos', 'approved']);
  assert.match(logs[0].reason, /from "Old XI"/);
  assert.equal(revalidations, 1, 'public standings refresh');
  assert.deepEqual([result.body.manager.team_name, result.body.manager.team_name_status, result.body.manager.team_name_locked], ['Dino Dynamos', 'approved', false]);

  reset();
  result = await rename('Old XI');
  assert.equal(result.status, 200); assert.equal(result.body.unchanged, true);
  assert.equal(writes.length + logs.length + revalidations, 0, 'unchanged name writes nothing');

  reset();
  result = await rename('The Badwords');
  assert.equal(result.status, 422, 'blocked term refused');
  assert.equal(manager.team_name, 'Old XI', 'flagged name never published');
  assert.equal(writes.length, 0); assert.equal(revalidations, 0);
  assert.deepEqual([logs[0].status, logs[0].resulting_name, logs[0].submitted_name], ['review_required', null, 'The Badwords'], 'refusal logged for the committee');
  assert.doesNotMatch(result.body.error, /badword/i, 'blocked terms stay private');

  reset({ team_name_locked: true, team_name_status: 'replaced' });
  result = await rename('Free XI');
  assert.equal(result.status, 403); assert.match(result.body.error, /locked by the league manager/);
  assert.equal(writes.length, 0);

  reset({ deleted_at: '2026-09-30T00:00:00Z' });
  assert.equal((await rename('Back XI')).status, 403);

  reset({ team_name_status: 'review_required' });
  await rename('Clean XI');
  assert.equal(manager.team_name_status, 'approved', 'a clean replacement clears a pending committee review');

  reset({ team_name_status: 'replaced' });
  await rename('My Own XI');
  assert.equal(manager.team_name, 'My Own XI', 'an unlocked committee replacement can be renamed');

  reset(); concurrentRename = true;
  result = await rename('Race XI');
  assert.equal(result.status, 409, 'a concurrent committee lock or rename wins');
  assert.equal(manager.team_name, 'Committee XI'); assert.equal(revalidations, 0);

  reset(); manager = null;
  assert.equal((await rename('Ghost XI')).status, 404, 'profile required first');

  reset(); fault = true;
  result = await rename('New XI');
  assert.equal(result.status, 500); assert.doesNotMatch(result.body.error, /private db error/);

  reset(); season = null;
  assert.equal((await rename('New XI')).status, 404); season = { id: 'season-1' };

  // Profile route: an existing team cannot switch to a flagged name either.
  const profile = fs.readFileSync('app/api/fantasy/manager/route.ts', 'utf8');
  assert.match(profile, /if \(existingManager && teamName !== existingManager\.team_name && moderation\.status !== 'approved'\) \{/);
  assert.ok(profile.indexOf("moderation.status !== 'approved') {") < profile.indexOf('.upsert(payload'), 'refusal happens before the upsert');
  assert.match(profile, /if \(existingManager\?\.team_name_locked && teamName !== existingManager\.team_name\)/, 'lock still enforced');
  console.log('PASS rename route: auth, rate limit, validation, normalisation, single-field write, lock, deleted, blocked terms refused and logged, concurrency guard, standings refresh.');

  // Account page editor (real component, network stubbed).
  const requests = [];
  let replyWith = body => ({ manager: { team_name: body.teamName, team_name_status: 'approved', team_name_locked: false } });
  const browser = { fantasyJsonFetch: async (url, init) => { const body = JSON.parse(init.body); requests.push({ url, body, method: init.method }); const reply = replyWith(body); if (reply instanceof Error) throw reply; return reply; } };
  const Editor = load('app/fantasy/_components/TeamNameEditor.tsx', { '@/lib/fantasy-browser': browser }, true).default;
  const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
  let saved = null, view;
  const mount = props => act(() => { view = create(React.createElement(Editor, { onSaved: next => { saved = next; }, ...props })); });
  const button = label => view.root.findAllByType('button').find(node => text(node).trim() === label);
  const field = () => view.root.findAllByType('input').find(node => node.props.id === 'newTeamName');

  await mount({ manager: { team_name: 'Old XI', team_name_status: 'approved', team_name_locked: false } });
  assert.match(text(view.root), /Old XI/);
  assert.ok(!field(), 'read-only until the manager chooses to change it');
  await act(async () => button('Change team name').props.onClick());
  assert.equal(field().props.value, 'Old XI');
  assert.equal(field().props.maxLength, 80);
  assert.equal(button('Save team name').props.disabled, true, 'nothing to save yet');
  await act(async () => field().props.onChange({ target: { value: '  New   XI ' } }));
  await act(async () => view.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.deepEqual(requests.at(-1), { url: '/api/fantasy/manager/team-name', body: { teamName: 'New XI' }, method: 'POST' });
  assert.deepEqual(saved, { team_name: 'New XI', team_name_status: 'approved', team_name_locked: false });
  assert.match(text(view.root), /Team name changed to New XI\./);
  assert.ok(!field(), 'editor closes after saving');

  replyWith = () => new Error('That team name cannot be used. Choose a different name, or contact the club if you think this is a mistake.');
  await act(async () => button('Change team name').props.onClick());
  await act(async () => field().props.onChange({ target: { value: 'Flagged XI' } }));
  saved = null;
  await act(async () => view.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(saved, null);
  assert.ok(view.root.findAll(node => node.props?.role === 'alert').some(node => /cannot be used/.test(text(node))), 'refusal shown as an alert');
  assert.equal(field().props.value, 'Flagged XI', 'typed name kept for correction');
  await act(async () => button('Cancel').props.onClick());
  assert.ok(!field());
  act(() => view.unmount());

  await mount({ manager: { team_name: 'Committee XI', team_name_status: 'replaced', team_name_locked: true } });
  assert.ok(!button('Change team name'), 'locked names cannot be edited');
  assert.match(text(view.root), /locked it\. Contact the club/);
  act(() => view.unmount());

  await mount({ manager: { team_name: 'Pending XI', team_name_status: 'review_required', team_name_locked: false } });
  assert.match(text(view.root), /waiting for committee approval/);
  act(() => view.unmount());

  const form = fs.readFileSync('app/fantasy/_components/FantasyAuthForms.tsx', 'utf8');
  assert.match(form, /import TeamNameEditor from '\.\/TeamNameEditor';/);
  assert.match(form, /\{mode !== 'login' && !\(mode === 'account' && manager\) && <Input id="teamName"/, 'registration and first profile keep the plain field');
  assert.match(form, /\{mode === 'account' && manager && <TeamNameEditor manager=\{manager\} onSaved=\{\(next\) => \{ setManager\(\(current: any\) => \(\{ \.\.\.current, \.\.\.next \}\)\); setTeamName\(next\.team_name\); \}\} \/>\}/, 'profile saves keep the renamed team');
  console.log('PASS account editor: opens on demand, normalises and saves, closes on success, shows refusals, keeps the draft, hides for locked names, explains pending review; wired into My Dino Coach account.');
})().catch(error => { console.error(error); process.exit(1); });
