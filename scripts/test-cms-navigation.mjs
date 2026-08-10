import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layout = readFileSync('app/admin/layout.tsx', 'utf8');
const permissions = readFileSync('lib/auth/permissions.ts', 'utf8');
const config = readFileSync('lib/auth/config.ts', 'utf8');

for (const group of ['Home','Season','Publish','Club','Community','Commercial','Fantasy','Administration']) {
  assert.match(layout, new RegExp(`title: '${group}'`));
}
for (const href of ['/admin/events','/admin/news','/admin/publications','/admin/teams','/admin/fantasy','/admin/sponsors','/admin/orders','/admin/users','/admin/season/new','/admin/season/registration','/admin/fantasy/reconciliation']) {
  assert.match(layout, new RegExp(`href: '${href.replace(/\//g, '\\/')}'`));
}
assert.match(layout, /Search admin modules/);
assert.match(layout, /Grouped admin navigation/);
assert.match(layout, /Mobile grouped admin navigation/);
assert.match(layout, /permissionForAdminPath/);
assert.match(layout, /hasPermission/);
assert.match(layout, /canManageUsers/);
assert.match(layout, /getDefaultAdminHref/);
assert.match(layout, /filter\(\(group\) => group\.links\.length > 0\)/);
assert.match(layout, /label: 'Users'.*usersOnly: true/);
assert.match(layout, /label: 'Password'/);
assert.doesNotMatch(layout, /fantasyManagerHrefs/);
assert.match(config, /'fantasy_manager'/);
assert.match(config, /'fantasy_support'/);
assert.match(permissions, /scope: 'fantasy'/);
assert.match(permissions, /return '\/admin\/change-password'/);

console.log('CMS navigation checks passed.');

const dashboard = readFileSync('app/admin/page.tsx', 'utf8');
assert.match(dashboard, /Current season/);
assert.match(dashboard, /Attention items/);
assert.match(dashboard, /\/admin\/season\/new/);
