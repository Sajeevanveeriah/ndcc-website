#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function loadTsModule(filename, requireMap = {}) {
  const source = readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (id) => {
    if (id in requireMap) return requireMap[id];
    throw new Error(`Unexpected test-time require ${id} from ${filename}`);
  };
  const execute = new Function('require', 'module', 'exports', 'process', 'console', output);
  execute(localRequire, module, module.exports, process, console);
  return module.exports;
}

const config = loadTsModule('lib/auth/config.ts');
const permissions = loadTsModule('lib/auth/permissions.ts', { './config': config });

const expectedRoles = [
  'admin', 'president', 'secretary', 'vice_president', 'treasurer',
  'committee', 'fantasy_manager', 'fantasy_support',
];
const fullRoles = ['admin', 'president', 'secretary', 'vice_president', 'treasurer'];
assert.deepEqual(config.AUTH_ROLES, expectedRoles, 'All eight CMS roles must be canonical.');
assert.deepEqual(config.FULL_ACCESS_ROLES, fullRoles, 'The five executive roles must be the full-access roles.');
assert.ok(permissions.ALL_PERMISSIONS.length >= 30, 'Permission registry must cover the complete CMS navigation.');
assert.ok(permissions.FANTASY_PERMISSIONS.length >= 6, 'Fantasy registry must cover all Fantasy modules.');

const allSorted = [...permissions.ALL_PERMISSIONS].sort();
for (const role of fullRoles) {
  assert.deepEqual([...permissions.getEffectivePermissions(role, [])].sort(), allSorted, `${role} must receive all CMS permissions.`);
  assert.equal(permissions.canManageUsers(role), true, `${role} must be able to manage users.`);
}
for (const role of ['committee', 'fantasy_manager', 'fantasy_support']) {
  assert.equal(permissions.canManageUsers(role), false, `${role} must not manage CMS users.`);
}

const committeeSelection = ['news', 'orders'];
assert.deepEqual(permissions.getEffectivePermissions('committee', committeeSelection), committeeSelection, 'Committee must receive only stored valid permissions.');
assert.deepEqual(permissions.getEffectivePermissions('committee', []), [], 'Empty Committee permissions must not mean full access.');
assert.deepEqual([...permissions.getEffectivePermissions('fantasy_manager', [])].sort(), [...permissions.FANTASY_PERMISSIONS].sort(), 'Fantasy Manager must receive all Fantasy permissions.');
const fantasySupportSelection = ['fantasy.players', 'fantasy.imports'];
assert.deepEqual(permissions.getEffectivePermissions('fantasy_support', fantasySupportSelection), fantasySupportSelection, 'Fantasy Support must receive only selected Fantasy permissions.');
assert.throws(() => permissions.normaliseStoredPermissions('committee', ['news', 'unknown.permission']), /invalid/i, 'Unknown permissions must be rejected.');
assert.throws(() => permissions.normaliseStoredPermissions('committee', ['news', 'news']), /duplicate/i, 'Duplicate permissions must be rejected.');
assert.throws(() => permissions.normaliseStoredPermissions('fantasy_support', ['fantasy.players', 'orders']), /invalid/i, 'Fantasy Support must reject non-Fantasy permissions.');
assert.deepEqual(permissions.normaliseStoredPermissions('fantasy_manager', ['orders']), [], 'Fantasy Manager must ignore stored granular permissions.');
assert.deepEqual(permissions.normaliseStoredPermissions('president', ['orders']), [], 'Full roles must not retain stored granular permissions.');

assert.equal(permissions.permissionForAdminPath('/admin/news'), 'news');
assert.equal(permissions.permissionForAdminPath('/admin/fantasy/imports/abc'), 'fantasy.imports');
assert.equal(permissions.permissionForAdminPath('/admin/fantasy/settings'), 'fantasy.home');
assert.equal(permissions.permissionForAdminPath('/admin/change-password'), null, 'Password is an authenticated utility, not a selectable permission.');
assert.equal(permissions.getDefaultAdminHref({ role: 'committee', permissions: ['orders'] }), '/admin/orders');
assert.equal(permissions.getDefaultAdminHref({ role: 'committee', permissions: [] }), '/admin/change-password');
assert.equal(permissions.getDefaultAdminHref({ role: 'fantasy_manager', permissions: permissions.FANTASY_PERMISSIONS }), '/admin/fantasy');

function collectRouteFiles(root) {
  const files = [];
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    if (statSync(full).isDirectory()) files.push(...collectRouteFiles(full));
    else if (entry === 'route.ts') files.push(full.replaceAll('\\', '/'));
  }
  return files;
}

const exemptAdminRoutes = new Set([
  'app/api/admin/auth/change-password/route.ts',
  'app/api/admin/auth/login/route.ts',
  'app/api/admin/auth/logout/route.ts',
  'app/api/admin/auth/readiness/route.ts',
  'app/api/admin/auth/session/route.ts',
  'app/api/admin/users/route.ts',
]);

for (const filename of collectRouteFiles('app/api/admin')) {
  if (exemptAdminRoutes.has(filename)) continue;
  const source = readFileSync(filename, 'utf8');
  const isSharedMediaUpload = filename === 'app/api/admin/media/upload/route.ts';
  const permissionProtected = source.includes('requirePermission(')
    || source.includes('requireAnyPermission(')
    || (isSharedMediaUpload && source.includes('MEDIA_UPLOAD_PERMISSIONS') && source.includes('hasPermission'));
  assert.equal(permissionProtected, true, `${filename} must enforce a server-side CMS permission.`);
  assert.doesNotMatch(source, /requireSession\s*\(\s*FANTASY_ADMIN_ROLES\s*\)/, `${filename} must not rely on the legacy Fantasy role allowlist.`);
  assert.doesNotMatch(source, /requireSession\s*\(\s*CLUB_ADMIN_ROLES\s*\)/, `${filename} must not rely on the legacy club role allowlist.`);
}

for (const filename of ['app/api/meeting-minutes/route.ts', 'app/api/meeting-minutes/[id]/actions/route.ts']) {
  const source = readFileSync(filename, 'utf8');
  assert.match(source, /requirePermission\('minutes'/, `${filename} must enforce the Minutes permission.`);
}

const layout = readFileSync('app/admin/layout.tsx', 'utf8');
assert.match(layout, /hasPermission\(user, permission\)/, 'Desktop/mobile navigation must filter by effective permission.');
assert.match(layout, /filter\(\(group\) => group\.links\.length > 0\)/, 'Empty navigation groups must disappear.');
assert.doesNotMatch(layout, /fantasyManagerHrefs/, 'Legacy Fantasy hard-coded navigation allowlist must be removed.');
assert.match(layout, /getDefaultAdminHref\(user\)/, 'Restricted users must resolve to an authorised landing page.');

const usersRoute = readFileSync('app/api/admin/users/route.ts', 'utf8');
assert.match(usersRoute, /canManageUsers\(user\.role\)/, 'User administration must use the canonical executive predicate.');
assert.match(usersRoute, /ndcc_admin_create_committee_user_with_access/);
assert.match(usersRoute, /ndcc_admin_update_committee_user_access/);
assert.doesNotMatch(usersRoute, /password_hash|session_token_hash/, 'User API source must not select or return password/session hashes.');
assert.match(usersRoute, /Explicit permissions are required when changing to this role/);

const merchSupplierExportRoute = readFileSync('app/api/admin/merch/export/route.ts', 'utf8');
assert.match(
  merchSupplierExportRoute,
  /requirePermission\('merchandise', \['committee'\]\)/,
  'Committee users with Merchandise permission must be able to export the apparel workbook.',
);

const resourcesRoute = readFileSync('app/api/admin/resources/[resource]/route.ts', 'utf8');
const merchWindowsConfig = resourcesRoute.match(/merchWindows:\s*\{[^}]+\}/)?.[0] ?? '';
assert.match(
  merchWindowsConfig,
  /writeRoles:\s*\['admin', 'committee'\]/,
  'Committee users with Merchandise permission must be able to create and update merch windows.',
);
assert.match(
  merchWindowsConfig,
  /deleteRoles:\s*\['admin'\]/,
  'Committee merch-window access must not grant delete authority.',
);

const session = readFileSync('lib/auth/session.ts', 'utf8');
assert.match(session, /cms_permissions/);
assert.match(session, /getEffectivePermissions/);
assert.match(session, /getLegacyEffectivePermissions/);

const migrationName = readdirSync('supabase/migrations').find((name) => name.endsWith('_granular_cms_access.sql'));
assert.ok(migrationName, 'Granular CMS access migration must exist.');
const migration = readFileSync(path.join('supabase/migrations', migrationName), 'utf8');
for (const role of expectedRoles) assert.match(migration, new RegExp(`'${role}'`), `Migration must support ${role}.`);
for (const fragment of [
  'cms_permissions TEXT[] NOT NULL',
  "WHERE role = 'committee'",
  'ndcc_cms_permissions_are_unique',
  'ndcc_admin_create_committee_user_with_access',
  'ndcc_admin_update_committee_user_access',
  'SECURITY DEFINER',
  'SET search_path = public, extensions',
  'TO service_role',
  'ALTER TABLE public.committee_users ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE public.committee_sessions ENABLE ROW LEVEL SECURITY',
  'DELETE FROM public.committee_sessions WHERE user_id = p_user_id',
]) assert.ok(migration.includes(fragment), `Migration missing: ${fragment}`);
assert.doesNotMatch(migration, /WHERE\s+(?:lower\()?email|WHERE\s+full_name/i, 'Migration must not infer role changes from names or email addresses.');

console.log('Admin permission policy checks passed.');
