#!/usr/bin/env node
// Deterministic tests for WP6b: revision diff, Trash restore payloads,
// global admin search permission filtering, best-effort audit writes and the
// static guarantees of the revision-history / audit-log migration and hooks.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (relative) => import(pathToFileURL(path.join(repoRoot, relative)).href);
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');

const diff = await load('lib/revisions/diff.ts');
const restore = await load('lib/revisions/restore.ts');
const tables = await load('lib/revisions/tables.ts');
const search = await load('lib/admin-search.ts');
const audit = await load('lib/admin-audit.ts');

let passed = 0;
async function test(name, fn) { await fn(); passed += 1; console.log(`  ok - ${name}`); }

// ---- diff ----------------------------------------------------------------
await test('diff reports changed, added and removed fields and ignores bookkeeping', () => {
  const before = { id: 'a', revision: 3, updated_at: 'x', title: 'Old', body: 'Same', tags: ['a', 'b'], retired: 'gone' };
  const after = { id: 'a', revision: 4, updated_at: 'y', title: 'New', body: 'Same', tags: ['a', 'b'], image_url: '/new.jpg' };
  assert.deepEqual(diff.diffSnapshots(before, after), [
    { field: 'image_url', kind: 'added', before: undefined, after: '/new.jpg' },
    { field: 'retired', kind: 'removed', before: 'gone', after: undefined },
    { field: 'title', kind: 'changed', before: 'Old', after: 'New' },
  ]);
});
await test('diff treats null, undefined and empty string as equal and compares objects by value', () => {
  assert.deepEqual(diff.diffSnapshots({ a: null, b: '', c: { y: 1, x: [1, 2] } }, { a: '', b: null, c: { x: [1, 2], y: 1 } }), []);
  assert.equal(diff.valuesEqual(0, ''), false);
  assert.equal(diff.valuesEqual(false, null), false);
  assert.deepEqual(diff.diffSnapshots(null, undefined), []);
  assert.equal(diff.diffSnapshots({ n: 1 }, { n: '1' }).length, 1);
});
await test('diff formatting is readable and bounded', () => {
  assert.equal(diff.fieldLabel('published_at'), 'Published at');
  assert.equal(diff.formatDiffValue(null), '(empty)');
  assert.equal(diff.formatDiffValue(true), 'Yes');
  assert.equal(diff.formatDiffValue({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(diff.formatDiffValue('x'.repeat(500), 10), 'xxxxxxxxxx...');
});

// ---- tables / restore ------------------------------------------------------
const ID = '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f';
await test('covered tables include the originals, the new tables and never club_settings', () => {
  const names = tables.REVISION_TABLES.map((entry) => entry.table);
  for (const table of ['news', 'publications', 'events', 'content_blocks', 'sponsors', 'player_sponsors', 'teams', 'season_appointments', 'gallery_albums', 'gallery_images', 'page_link_cards', 'facility_features', 'history_lineage_entries', 'history_premierships', 'history_competitions', 'committee_members', 'apparel_products', 'kitchen_menus', 'kitchen_items', 'social_membership_plans']) {
    assert.ok(names.includes(table), `${table} must be covered`);
  }
  assert.equal(names.includes('club_settings'), false);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(tables.REVISION_TABLES.filter((entry) => entry.versioned).map((entry) => entry.table), ['news', 'publications', 'events', 'content_blocks']);
  for (const entry of tables.REVISION_TABLES) assert.match(entry.href, /^\/admin\//);
});
await test('describeSnapshot and trash cutoff', () => {
  assert.equal(tables.describeSnapshot('season_appointments', { name: 'A Coach', role: 'Head coach' }), 'A Coach - Head coach');
  assert.equal(tables.describeSnapshot('news', { title: '  ' }), 'Untitled record');
  assert.equal(tables.describeSnapshot('news', null), 'Untitled record');
  assert.equal(tables.trashCutoffIso(new Date('2026-12-30T00:00:00Z')), '2026-10-01T00:00:00.000Z');
});
await test('restore payload keeps the archived row and requires a matching id', () => {
  const snapshot = { id: ID, title: 'Kept', revision: 2, published: false, missing: undefined };
  assert.deepEqual(restore.buildRestorePayload(snapshot, ID), { ok: true, payload: { id: ID, title: 'Kept', revision: 2, published: false } });
  assert.equal(restore.buildRestorePayload({ ...snapshot, id: '11111111-2222-4333-8444-555555555555' }, ID).ok, false);
  assert.equal(restore.buildRestorePayload(snapshot, 'not-a-uuid').ok, false);
  assert.equal(restore.buildRestorePayload(null, ID).ok, false);
  assert.equal(restore.buildRestorePayload([snapshot], ID).ok, false);
});
await test('restore drops only columns PostgREST reports missing, never id', () => {
  const payload = { id: ID, title: 'T', old_col: 1 };
  assert.deepEqual(restore.withoutMissingColumn(payload, { code: 'PGRST204', message: "Could not find the 'old_col' column of 'news' in the schema cache" }), { id: ID, title: 'T' });
  assert.equal(restore.withoutMissingColumn(payload, { message: "Could not find the 'id' column of 'news'" }), null);
  assert.equal(restore.withoutMissingColumn(payload, { message: "Could not find the 'nope' column of 'news'" }), null);
  assert.equal(restore.withoutMissingColumn(payload, { code: '23505', message: 'duplicate key' }), null);
});
await test('restore errors map to clear conflict and missing-parent messages', () => {
  assert.match(restore.classifyRestoreError({ code: '23505', message: 'duplicate key value violates unique constraint "news_pkey"' }).error, /restored already/);
  assert.match(restore.classifyRestoreError({ code: '23505', message: 'duplicate key value violates unique constraint "publications_slug_key"' }).error, /clashes/);
  const parent = restore.classifyRestoreError({ code: '23503', message: 'insert or update violates foreign key constraint' });
  assert.equal(parent.status, 409);
  assert.match(parent.error, /Restore that first/);
  assert.equal(restore.classifyRestoreError({ code: '23514', message: 'check constraint' }).status, 409);
  assert.equal(restore.classifyRestoreError({ message: 'boom' }).status, 500);
});
await test('latestDeletionPerRecord keeps the newest archive per record', () => {
  const rows = [
    { id: '3', resource_table: 'news', record_id: 'a' },
    { id: '2', resource_table: 'news', record_id: 'a' },
    { id: '1', resource_table: 'teams', record_id: 'a' },
  ];
  assert.deepEqual(restore.latestDeletionPerRecord(rows).map((row) => row.id), ['3', '1']);
});

// ---- search ----------------------------------------------------------------
await test('search sources are filtered by permission', () => {
  assert.deepEqual(search.searchSourcesForUser({ permissions: ['news', 'orders'] }).map((source) => source.key), ['news', 'orders']);
  assert.deepEqual(search.searchSourcesForUser({ permissions: [] }), []);
  assert.deepEqual(search.searchSourcesForUser(null), []);
  const members = search.searchSourcesForUser({ permissions: ['memberships'] });
  assert.deepEqual(members.map((source) => source.table), ['club_member_directory']);
  const all = search.searchSourcesForUser({ permissions: search.SEARCH_SOURCES.map((source) => source.permission) });
  assert.deepEqual(all.map((source) => source.key), ['news', 'publications', 'events', 'sponsors', 'teams', 'gallery', 'members', 'orders']);
  const orders = search.SEARCH_SOURCES.find((source) => source.key === 'orders');
  assert.deepEqual(orders.searchFields, ['payment_reference']);
  assert.equal(orders.excludeDeleted, true);
});
await test('search terms cannot inject PostgREST filter syntax', () => {
  assert.equal(search.sanitiseSearchTerm('a'), '');
  assert.equal(search.sanitiseSearchTerm(42), '');
  assert.equal(search.sanitiseSearchTerm('  Grand   Final  '), 'Grand Final');
  assert.equal(search.sanitiseSearchTerm('x,title.eq.1)(*%'), 'x title.eq.1');
  assert.equal(search.sanitiseSearchTerm('NDCC-MEM-1234'), 'NDCC-MEM-1234');
  assert.equal(search.sanitiseSearchTerm('y'.repeat(200)).length, search.SEARCH_MAX_LENGTH);
  const filter = search.buildSearchFilter(search.SEARCH_SOURCES.find((source) => source.key === 'teams'), 'first xi');
  assert.equal(filter, 'name.ilike.*first xi*,grade.ilike.*first xi*');
  assert.doesNotMatch(search.sanitiseSearchTerm('a,b(c)d*e"f\'g'), /[,()*"']/);
});
await test('search results carry the admin link and readable detail', () => {
  const source = search.SEARCH_SOURCES.find((entry) => entry.key === 'events');
  assert.deepEqual(search.toSearchResult(source, { id: 7, title: 'Presentation night', date: '2027-03-01', location: '' }), {
    source: 'events', label: 'Events', id: '7', title: 'Presentation night', detail: '2027-03-01', href: '/admin/events',
  });
  assert.equal(search.toSearchResult(source, { id: 1 }).title, 'Untitled');
});

// ---- audit -------------------------------------------------------------------
await test('audit rows are normalised and bounded', () => {
  const row = audit.buildAuditRow({ actor: { id: ID, email: 'a@b.test' }, action: 'Update', resource: 'news', recordId: ID, summary: 'Changed:\ntitle' + 'x'.repeat(2000) });
  assert.equal(row.action, 'update');
  assert.equal(row.actor_id, ID);
  assert.equal(row.summary.length, 1000);
  assert.doesNotMatch(row.summary, /\n/);
  assert.equal(audit.buildAuditRow({ actor: { id: 'bad' }, action: 'x', resource: 'y' }).actor_id, null);
  assert.equal(audit.buildAuditRow({ actor: null, action: '', resource: 'news' }), null);
  assert.equal(audit.buildAuditRow({ actor: null, action: 'delete', resource: '' }), null);
  assert.equal(audit.buildAuditRow({ actor: null, action: 'delete', resource: 'club', recordId: 'default' }).record_id, 'default');
});
await test('audit summaries name fields but never copy values', () => {
  assert.equal(audit.summariseFields('Changed', { email: 'private@x.test', phone: '0400' }), 'Changed: email, phone');
  assert.equal(audit.summariseFields('Changed', {}), 'Changed');
  assert.match(audit.summariseFields('Changed', Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`f${i}`, i]))), /and 3 more$/);
});
await test('audit writes are best-effort and never throw', async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const inserted = [];
    const ok = { from: (table) => ({ insert: async (row) => { inserted.push([table, row]); return { error: null }; } }) };
    assert.equal(await audit.writeAdminAudit(ok, { actor: { id: ID, email: 'a@b.test' }, action: 'create', resource: 'news' }), true);
    assert.equal(inserted[0][0], 'admin_audit_log');
    const missingTable = { from: () => ({ insert: async () => ({ error: { code: 'PGRST205', message: "Could not find the table 'public.admin_audit_log'" } }) }) };
    assert.equal(await audit.writeAdminAudit(missingTable, { actor: null, action: 'create', resource: 'news' }), false);
    const throwsSync = { from: () => { throw new Error('config'); } };
    assert.equal(await audit.writeAdminAudit(throwsSync, { actor: null, action: 'create', resource: 'news' }), false);
    const rejects = { from: () => ({ insert: () => Promise.reject(new Error('network')) }) };
    assert.equal(await audit.writeAdminAudit(rejects, { actor: null, action: 'create', resource: 'news' }), false);
    assert.equal(await audit.writeAdminAudit(null, { actor: null, action: 'create', resource: 'news' }), false);
    assert.equal(await audit.writeAdminAudit(ok, null), false);
  } finally {
    console.warn = warn;
  }
});

// ---- static guarantees ---------------------------------------------------------
await test('migration is additive, exception-safe and leaves the versioned trigger alone', () => {
  const file = readdirSync(path.join(repoRoot, 'supabase/migrations')).find((name) => name.endsWith('_revision_history_and_audit_log.sql'));
  assert.ok(file, 'revision history migration must exist');
  const version = file.slice(0, 14);
  assert.ok(version >= '20260927080000' && version <= '20260927089999', 'migration must stay in the WP6b range');
  const sql = read(`supabase/migrations/${file}`);
  const body = sql.replace(/--.*$/gm, '');
  assert.match(body, /begin;\s*set local lock_timeout = '3s';/i);
  assert.match(body, /commit;\s*$/i);
  assert.match(body, /exception when others then[\s\S]*raise warning/i, 'archive failures must downgrade to a warning');
  assert.match(body, /after update or delete/i, 'generic trigger must run after the write and never alter NEW');
  assert.doesNotMatch(body, /ndcc_archive_editorial_revision/i, 'the original versioned trigger function must not be replaced');
  assert.doesNotMatch(body, /'(news|publications|events|content_blocks)'/, 'original versioned tables must keep their trigger only');
  assert.doesNotMatch(body, /'club_settings'/, 'club_settings has a text key and must be skipped');
  assert.doesNotMatch(body, /\b(drop table|drop column|alter column|truncate)\b/i);
  assert.match(body, /alter table public\.admin_audit_log enable row level security/i);
  assert.match(body, /revoke all on public\.admin_audit_log from public, anon, authenticated/i);
  assert.match(body, /revoke all on function public\.ndcc_archive_row_revision\(\) from public, anon, authenticated/i);
  assert.match(sql, /-- Rollback/);
});
await test('admin routes record audits without changing their responses', () => {
  const resources = read('app/api/admin/resources/[resource]/route.ts');
  for (const action of ['create', 'update', 'batch_update', 'delete', 'batch_delete', 'restore']) {
    assert.match(resources, new RegExp(`scheduleAdminAudit\\(\\{ actor: user, action: '${action}'`), `resources route must audit ${action}`);
  }
  assert.match(resources, /hasRevisionHistory\(config\.table\)/);
  assert.match(resources, /if \(versioned\) update = update\.eq\('revision', revision\);/, 'stale-save check must remain');
  const server = read('lib/revisions/server.ts');
  assert.match(server, /after\(run\)/, 'audit writes must run after the response');
  assert.match(read('app/api/admin/users/route.ts'), /scheduleAdminAudit\(/);
  assert.match(read('app/api/admin/payments/bank-transfers/route.ts'), /scheduleAdminAudit\(/);
});
await test('trash and audit are full-access only; search is permission filtered', () => {
  for (const file of ['app/api/admin/trash/route.ts', 'app/api/admin/audit/route.ts']) {
    const source = read(file);
    assert.match(source, /requirePermissionResult\(/);
    assert.match(source, /isFullAccessRole\(/);
  }
  const searchRoute = read('app/api/admin/search/route.ts');
  assert.match(searchRoute, /searchSourcesForUser\(user\)/);
  const layout = read('app/admin/layout.tsx');
  assert.match(layout, /label: 'Audit log'.*usersOnly: true/);
  assert.match(layout, /label: 'Trash'.*usersOnly: true/);
  assert.match(layout, /\['\/admin\/audit', '\/admin\/trash'\][^\n]*canManageUsers\(user\.role\)/);
  assert.match(layout, /router\.push\(`\/admin\/search\?q=\$\{encodeURIComponent\(navSearch\.trim\(\)\)\}`\)/);
});

console.log(`admin revisions/audit/search tests passed (${passed})`);
