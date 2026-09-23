import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const orchestrator = read('lib/playhq/fantasy-orchestrator.ts');
const seasonsApi = read('app/api/admin/fantasy/seasons/route.ts');
const logsApi = read('app/api/admin/fantasy/logs/route.ts');
const ordersApi = read('app/api/admin/resources/[resource]/route.ts');
const migration = read('supabase/migrations/20260827012857_cms_scheduling_fantasy_logs_order_cleanup.sql');
const softDeleteMigration = read('supabase/migrations/20260917232650_dino_admin_lifecycle.sql');

assert.match(orchestrator, /season\.status !== 'active'/, 'alerts must be limited to active seasons');
assert.match(orchestrator, /\.eq\('status', 'active'\)/, 'automatic sync must select active seasons only');
assert.match(seasonsApi, /completed'[\s\S]*archived'[\s\S]*auto_sync_enabled = false/, 'completed and archived transitions must disable auto sync');
assert.match(migration, /update public\.fantasy_seasons[\s\S]*status in \('completed', 'archived'\)[\s\S]*auto_sync_enabled = true/, 'migration must disable existing completed and archived automatic sync');
assert.match(logsApi, /user\?\.role === 'admin'/, 'log clearing must be admin-only');
assert.match(logsApi, /p_season_id/, 'log clearing must support selected-season scope');
assert.match(migration, /delete from fantasy_sync_runs/, 'log clear must remove operational telemetry');
for (const protectedTable of ['fantasy_match_stats', 'fantasy_player_prices', 'fantasy_entries', 'order_payments']) {
  const clearBody = migration.match(/create or replace function public\.clear_fantasy_operational_logs[\s\S]*?\$\$;/)?.[0] || '';
  assert.doesNotMatch(clearBody, new RegExp(`delete from ${protectedTable}`), `${protectedTable} must be preserved when clearing logs`);
}
// Orders are now soft-deleted (recoverable) through a single admin-only RPC
// instead of the original hard-delete cleanup RPC.
assert.match(ordersApi, /rpc\('set_order_deleted'[\s\S]{0,200}p_deleted: true/, 'order deletion must use the atomic soft-delete RPC');
assert.match(ordersApi, /x-delete-confirmation/, 'order deletion must forward the typed confirmation');
assert.match(ordersApi, /Orders must be deleted one at a time/, 'orders must not be batch deleted');
const orderDeleteBlock = ordersApi.match(/if \(resource === 'orders' \|\| resource === 'kitchenOrders'\) \{\s*if \(!id\)[\s\S]*?\n  \}/)?.[0];
assert.ok(orderDeleteBlock, 'order delete branch must exist');
assert.doesNotMatch(orderDeleteBlock, /\.delete\(\)/, 'orders must never be hard-deleted');
const softDeleteFn = softDeleteMigration.match(/create function public\.set_order_deleted[\s\S]*?\$\$;/)?.[0] || '';
assert.match(softDeleteFn, /committee_users where id=p_actor and role='admin' and is_active/, 'soft delete must be admin-only');
assert.match(softDeleteFn, /p_confirmation is distinct from 'DELETE ORDER'/, 'soft delete must require typed confirmation');
assert.match(softDeleteFn, /set deleted_at=/, 'soft delete must mark rows rather than delete them');
assert.doesNotMatch(softDeleteFn, /delete from/i, 'soft delete must not hard-delete rows');
assert.doesNotMatch(softDeleteFn, /security definer/i, 'soft delete RPC must not bypass table permissions');
assert.match(softDeleteMigration, /revoke all on function public\.set_order_deleted\(uuid,text,boolean,uuid,text\) from public,anon,authenticated/, 'soft delete RPC must not be callable by browser roles');
assert.match(migration, /p_confirmation <> 'DELETE TEST ORDER'/, 'test-order deletion must require typed confirmation');
assert.match(migration, /Order is not explicitly marked as dummy\/test/, 'real orders must remain protected');
assert.match(migration, /coalesce\(current_setting\('ndcc\.allow_test_order_cleanup', true\), ''\) <> 'on'/, 'settled payment deletion must remain denied unless the transaction guard is explicitly enabled');
assert.match(migration, /security invoker/g, 'cleanup RPCs must retain caller permissions');
assert.doesNotMatch(migration, /security definer/i, 'cleanup RPCs must not bypass table permissions');
console.log('Operational control regression tests passed.');
