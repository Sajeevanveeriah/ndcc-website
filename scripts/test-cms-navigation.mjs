import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const layout = readFileSync('app/admin/layout.tsx', 'utf8');
for (const group of ['Home','Season','Publish','Club','Community','Commercial','Fantasy','Administration']) assert.match(layout, new RegExp(`title: '${group}'`));
for (const href of ['/admin/events','/admin/news','/admin/publications','/admin/teams','/admin/fantasy','/admin/sponsors','/admin/orders','/admin/users','/admin/season/new','/admin/fantasy/reconciliation']) assert.match(layout, new RegExp(`href: '${href.replace(/\//g, '\\/')}'`));
assert.match(layout, /Search admin modules/);
assert.match(layout, /fantasy_manager/);
assert.match(layout, /roles: \['admin'\]/);
assert.match(layout, /Grouped admin navigation/);
console.log('CMS navigation checks passed.');

const dashboard = readFileSync('app/admin/page.tsx', 'utf8');
assert.match(dashboard, /Current season/);
assert.match(dashboard, /Attention items/);
assert.match(dashboard, /\/admin\/season\/new/);
