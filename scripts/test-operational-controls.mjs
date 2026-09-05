import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const orchestrator = read('lib/playhq/fantasy-orchestrator.ts');
const seasonsApi = read('app/api/admin/fantasy/seasons/route.ts');
const logsApi = read('app/api/admin/fantasy/logs/route.ts');
const ordersApi = read('app/api/admin/resources/[resource]/route.ts');
const migration = read('supabase/migrations/20260827012857_cms_scheduling_fantasy_logs_order_cleanup.sql');

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
assert.match(ordersApi, /delete_test_order_atomic/, 'orders must use the atomic cleanup RPC');
assert.match(migration, /p_confirmation <> 'DELETE TEST ORDER'/, 'test-order deletion must require typed confirmation');
assert.match(migration, /Order is not explicitly marked as dummy\/test/, 'real orders must remain protected');
assert.match(migration, /coalesce\(current_setting\('ndcc\.allow_test_order_cleanup', true\), ''\) <> 'on'/, 'settled payment deletion must remain denied unless the transaction guard is explicitly enabled');
assert.match(migration, /security invoker/g, 'cleanup RPCs must retain caller permissions');
assert.doesNotMatch(migration, /security definer/i, 'cleanup RPCs must not bypass table permissions');
console.log('Operational control regression tests passed.');
