#!/usr/bin/env node
// Deterministic checks for WP6a CMS guardrails: read-only views for users who
// cannot write, server-side resource validation with friendly errors, the
// sponsor fallback rule, the dashboard "Needs attention" panel and the
// membership pages' admin fetch helpers. No database, network or secrets.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(import.meta.dirname, '..');

function loader(mocks = {}) {
  const cache = new Map();
  function resolveFile(base) {
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`]) if (existsSync(candidate) && !candidate.endsWith('/')) return candidate;
    throw new Error(`Cannot resolve ${base}`);
  }
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    if (file.endsWith('.json')) { module.exports = JSON.parse(readFileSync(file, 'utf8')); return module.exports; }
    const source = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: file })((id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('@/')) return load(resolveFile(path.join(root, id.slice(2))));
      if (id.startsWith('.')) return load(resolveFile(path.resolve(path.dirname(file), id)));
      return require(id);
    }, module, module.exports);
    return module.exports;
  }
  return (file) => load(path.join(root, file));
}

const read = (file) => readFileSync(path.join(root, file), 'utf8');
const load = loader();
let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

console.log('Admin CMS guardrail checks:');

const validation = load('lib/admin-resource-validation.ts');

test('news, events, teams, sponsors, apparel and kitchen payloads are validated with friendly messages', () => {
  const v = validation.RESOURCE_VALIDATORS;
  assert.deepEqual(Object.keys(v).sort(), ['apparelProducts', 'events', 'kitchenItems', 'kitchenMenus', 'news', 'sponsors', 'teams']);
  assert.equal(v.news({ title: '  ', content: 'x' }, true), 'Title is required.');
  assert.equal(v.news({ title: 'Round 1', content: '', published_at: 'not a date' }, true), 'Publish date must be a valid date and time.');
  assert.equal(v.news({ title: 'Round 1', content: '', published: true, published_at: '2026-10-03T00:00:00.000Z', sort_order: 0 }, true), null);
  assert.equal(v.news({ sort_order: 2 }, false), null, 'reordering alone is valid');
  assert.equal(v.news({ title: 'x'.repeat(201) }, false), 'Title must be 200 characters or fewer.');
  assert.equal(v.events({ title: 'Presentation night' }, true), 'Event date is required.');
  assert.equal(v.events({ title: 'Presentation night', date: '2026-10-03T08:00:00.000Z', capacity: 1.5 }, true), 'Capacity must be a whole number.');
  assert.equal(v.events({ title: 'Presentation night', date: '2026-10-03T08:00:00.000Z', capacity: null, ticket_price: -1 }, true), 'Ticket price cannot be less than 0.');
  assert.equal(v.events({ title: 'Presentation night', date: '2026-10-03T08:00:00.000Z', capacity: null, ticket_price: 0, published: false }, true), null);
  assert.equal(v.events({ published: true }, false), null, 'batch publish stays valid');
  assert.equal(v.teams({ name: '', grade: 'A' }, true), 'Team name is required.');
  assert.equal(v.teams({ name: '1st XI', grade: '', description: '', captain: null, sort_order: 1, is_active: true }, true), null);
  assert.equal(v.sponsors({ name: 'Sponsor', sort_order: 'x' }, true), 'Sort order must be a number.');
  assert.equal(v.sponsors({ name: 'Sponsor', logo_url: '', website: null, description: '', sort_order: 0, active: true }, true), null);
  assert.equal(v.apparelProducts({ name: 'Shirt', slug: 'shirt' }, true), 'Price is required.');
  assert.equal(v.apparelProducts({ name: 'Shirt', slug: 'shirt', price: 45, order_email: 'not-an-email' }, true), 'Order email must be a valid email address.');
  assert.equal(v.apparelProducts({ name: 'Shirt', slug: 'shirt', price: '45', order_email: null, display_order: 1 }, true), null);
  assert.equal(v.kitchenItems({ name: 'Pie', price: 5 }, true), 'Menu is required.');
  assert.equal(v.kitchenItems({ menu_id: 'menu', name: 'Pie', price: 5, sort_order: 0 }, true), null);
  assert.equal(v.kitchenItems({ is_available: 'yes' }, false), 'Available must be on or off.');
  assert.equal(v.kitchenMenus({ name: '' }, true), 'Menu name is required.');
});

test('database errors map to friendly messages without leaking raw details', () => {
  const raw = 'duplicate key value violates unique constraint "apparel_products_slug_key"';
  const friendly = validation.friendlyDatabaseError({ code: '23505', message: raw });
  assert.equal(friendly.status, 409);
  assert.doesNotMatch(friendly.error, /apparel_products|constraint/);
  assert.equal(validation.friendlyDatabaseError({ code: '23502', message: 'null value in column "name"' }).status, 400);
  assert.equal(validation.friendlyDatabaseError({ code: '22P02', message: 'invalid input syntax for type uuid' }).status, 400);
  assert.equal(validation.friendlyDatabaseError({ code: 'XX000', message: 'internal' }).status, 500);
});

test('resources route validates, returns friendly errors and exposes canWrite without changing server checks', () => {
  const route = read('app/api/admin/resources/[resource]/route.ts');
  assert.match(route, /const validationError = validateResourcePayload\(resource, config, payload, true\);/);
  assert.match(route, /const validationError = validateResourcePayload\(resource, config, payload, false\);/);
  assert.doesNotMatch(route, /NextResponse\.json\(\{ success: false, error: (error|batchError|fallback\.error|currentSeasonError)\??\.message/);
  assert.match(route, /return databaseErrorResponse\(resource, 'create', error\);/);
  assert.match(route, /return databaseErrorResponse\(resource, 'update', error\);/);
  assert.match(route, /return databaseErrorResponse\(resource, 'batch update', batchError\);/);
  assert.match(route, /const accessFlags = \{ canWrite: canWrite\(user\.role, config\), canDelete: canDelete\(user\.role, config\) && config\.allowDelete !== false \};/);
  assert.match(route, /return NextResponse\.json\(\{ success: true, data, \.\.\.accessFlags \}\);/);
  // Write checks unchanged.
  assert.equal((route.match(/if \(!user \|\| !canWrite\(user\.role, config\)\) \{\n    return NextResponse\.json\(\{ success: false, error: 'Your role cannot edit this section\.' \}, \{ status: 403 \}\);/g) || []).length, 2);
  for (const [resource, roles] of [['pageLinkCards', "['admin']"], ['historyLineage', "['admin']"], ['volunteerPositions', "['admin']"], ['kitchenMenus', "['admin']"], ['raffleCampaigns', "['admin']"]]) {
    assert.match(route, new RegExp(`  ${resource}: \\{ table: '[a-z_]+', readRoles: \\[[^\\]]+\\], writeRoles: ${roles.replace(/[[\]]/g, '\\$&')}`), resource);
  }
});

test('committee users see a clear read-only view where they cannot save', () => {
  const notice = read('components/admin/ReadOnlyNotice.tsx');
  assert.match(notice, /You can view this section\. Ask a full-access committee member to make changes\./);
  const { responseCanWrite } = load('components/admin/ReadOnlyNotice.tsx');
  assert.equal(responseCanWrite({ canWrite: false }), false);
  assert.equal(responseCanWrite({ canWrite: true }), true);
  assert.equal(responseCanWrite({}), true, 'older responses keep editing enabled');
  const pages = {
    'app/admin/site-pages/page.tsx': [/\{cardsWritable && <form/, /\{featuresWritable && <form/],
    'app/admin/history/page.tsx': [/\{historyWritable && <form className="grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit=\{saveCompetition\}/, /\{committeeWritable && <form/],
    'app/admin/volunteers/page.tsx': [/\{positionsWritable && <form/, /\{expressionsWritable && v\.status !== 'contacted'/],
    'app/admin/kitchen/page.tsx': [/\{!menusWritable \? null : editingMenu/, /\{!itemsWritable \? null : editingItem/, /\{!ordersWritable \?/],
    'app/admin/raffle/page.tsx': [/\{campaignsWritable&&<Button onClick=\{saveVisibility\}/],
  };
  for (const [file, patterns] of Object.entries(pages)) {
    const source = read(file);
    assert.match(source, /<ReadOnlyNotice/, file);
    assert.match(source, /responseCanWrite\(/, file);
    for (const pattern of patterns) assert.match(source, pattern, `${file} ${pattern}`);
  }
});

test('sponsor fallback fills the list only when the CMS returns no sponsors; CMS fields are never backfilled', () => {
  const { mergeSponsorsWithFallback, fallbackSponsors } = load('lib/fallback-content.ts');
  const cleared = mergeSponsorsWithFallback([{ id: 'cms-mbr', name: 'MBR Cricket', logo_url: '', website: '', description: '', tier: 'major', active: true }]);
  assert.equal(cleared.length, 1, 'a non-empty CMS list is authoritative');
  assert.equal(cleared[0].logo_url, '', 'a cleared logo stays cleared');
  assert.equal(cleared[0].website, '', 'a cleared website stays cleared');
  assert.equal(cleared[0].description, '', 'a cleared description stays cleared');
  const kept = mergeSponsorsWithFallback([{ id: 'cms-1', name: 'Priceline Pharmacy', logo_url: '/images/cms.png', website: 'https://example.com', active: true }]);
  assert.equal(kept[0].logo_url, '/images/cms.png');
  assert.equal(mergeSponsorsWithFallback([]).length, fallbackSponsors.length, 'empty CMS uses the full fallback list');
  assert.equal(mergeSponsorsWithFallback(null).length, fallbackSponsors.length, 'unavailable CMS uses the full fallback list');
});

test('Needs attention items follow the linked page permissions and tolerate failures', () => {
  const attention = load('lib/admin-dashboard-attention.ts');
  const keys = (user) => attention.attentionDefinitionsFor(user).map((item) => item.key);
  assert.deepEqual(keys({ role: 'admin', permissions: [] }), ['unconfirmedBankDeposits', 'receiptDeliveryProblems'], 'role-based items only');
  const permissions = load('lib/auth/permissions.ts');
  const admin = { role: 'admin', permissions: permissions.getEffectivePermissions('admin') };
  assert.deepEqual(keys(admin), ['pendingMemberships', 'unconfirmedBankDeposits', 'raffleCashNotHandedIn', 'fantasySyncExceptions', 'receiptDeliveryProblems', 'unreadEnquiries']);
  const president = { role: 'president', permissions: permissions.getEffectivePermissions('president') };
  assert.ok(!keys(president).includes('unconfirmedBankDeposits'), 'bank deposit review is administrator-only');
  assert.ok(keys(president).includes('receiptDeliveryProblems'));
  const committee = { role: 'committee', permissions: ['dashboard', 'raffle', 'enquiries'] };
  assert.deepEqual(keys(committee), ['raffleCashNotHandedIn', 'unreadEnquiries']);
  assert.equal(attention.sumCounts([1, 2, 3]), 6);
  assert.equal(attention.sumCounts([1, null]), null);
  const route = read('app/api/admin/dashboard/route.ts');
  assert.match(route, /async function safeCount\(query: \(\) => CountQuery\): Promise<number \| null> \{\n  try \{/);
  assert.match(route, /const attentionPromise = loadAttention\(supabase, user\)\.catch\(\(\) => \[\] as AttentionItem\[\]\);/);
  assert.match(route, /attention: await attentionPromise,/);
  assert.match(route, /\.eq\('membership_status', 'pending'\)/);
  assert.match(route, /\.is\('cash_handed_in_at', null\)/);
  assert.match(route, /\.not\('sync_exception', 'is', null\)/);
  assert.match(route, /\.in\('status', \['dead_letter', 'retry'\]\)/);
  const page = read('app/admin/page.tsx');
  assert.match(page, /Needs attention/);
  assert.match(page, /item\.count === null \? 'Unavailable' : item\.count/);
});

test('membership directory and preferences pages use the admin fetch helpers', () => {
  for (const file of ['app/admin/memberships/directory/page.tsx', 'app/admin/memberships/preferences/page.tsx']) {
    const source = read(file);
    assert.match(source, /import \{ adminFetch, parseApiResponse \} from '@\/lib\/admin-client';/, file);
    assert.doesNotMatch(source, /(^|[^a-zA-Z])fetch\(/, `${file} has no raw fetch`);
  }
});

console.log(`test-admin-cms-guardrails: ${passed} tests passed`);
