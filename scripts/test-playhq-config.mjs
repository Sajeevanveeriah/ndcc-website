#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
function read(file) { return readFileSync(path.join(root, file), 'utf8'); }
function fail(message) { console.error(message); process.exit(1); }
function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') return [];
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const configSource = read('lib/playhq/config.ts');
const clientSource = read('lib/playhq/client.ts');
const fixturesRoute = read('app/api/public/playhq/fixtures/route.ts');
const diagnosticsRoute = read('app/api/admin/playhq/diagnostics/route.ts');
const authMigration = read('supabase/migrations/20260630_repair_committee_auth_crypt_resolution.sql');
const ioMigration = read('supabase/migrations/20260630_reduce_public_query_io.sql');
const policyMigration = read('supabase/migrations/20260630_cleanup_duplicate_public_read_policies.sql');

if (!configSource.includes("import 'server-only'")) fail('PlayHQ config must be server-only.');
if (!clientSource.includes("'x-api-key': config.apiKey")) fail('PlayHQ client must send x-api-key from server env.');
if (!clientSource.includes('AbortController')) fail('PlayHQ client must use AbortController timeout.');
if (!fixturesRoute.includes('getPlayHQPublicData')) fail('Public PlayHQ fixtures route must use service layer.');
if (!diagnosticsRoute.includes('redactedPlayHQConfig')) fail('Admin PlayHQ diagnostics must use redacted config.');
if (!authMigration.includes('extensions.crypt(p_password, u.password_hash)')) fail('Auth crypt repair migration must use extensions.crypt.');
if (!authMigration.includes("NOTIFY pgrst, 'reload schema'")) fail('Auth crypt repair migration must notify PostgREST schema reload.');
if (!ioMigration.includes('idx_page_link_cards_public_lookup') || !ioMigration.includes('idx_committee_members_active_sort_lookup')) fail('Public query IO migration missing required public indexes.');
if (!ioMigration.includes('idx_event_registrations_event_id') || !ioMigration.includes('idx_member_applications_order_id_fk')) fail('Public query IO migration missing required FK indexes.');
if (!policyMigration.includes('DROP POLICY IF EXISTS committee_members_public_read_active')) fail('Policy cleanup migration must drop known duplicate public-read policies.');
if (/DROP POLICY[^;]+committee_(users|sessions)/i.test(policyMigration)) fail('Policy cleanup migration must not alter committee auth table policies.');
if (fixturesRoute.includes('PLAYHQ_API_KEY') || fixturesRoute.includes('x-api-key')) fail('Public PlayHQ fixtures route must not expose key handling.');

for (const file of walk(root)) {
  const rel = path.relative(root, file);
  if (!/\.(ts|tsx|js|mjs|sql|md|example|json)$/.test(rel)) continue;
  const source = readFileSync(file, 'utf8');
  if (source.includes('NEXT_PUBLIC_' + 'PLAYHQ_API_KEY')) fail(`${rel} must not reference public PlayHQ API key env.`);
  if (/PLAYHQ_API_KEY\s*=\s*(?!replace_with|your-|redacted|$)[A-Za-z0-9_-]{12,}/.test(source)) fail(`${rel} appears to contain a real PlayHQ key.`);
}

if (!configSource.includes('configured: missing.length === 0')) fail('PlayHQ config loader must derive configured:false from missing env.');
if (!configSource.includes('replace(/\\]+$/g') || !configSource.includes("replace(/\\/$/, '')")) fail('PlayHQ base URL cleaner must remove trailing bracket and slash.');
if (!configSource.includes('redactedPlayHQConfig')) fail('PlayHQ config must export redacted diagnostics config.');

console.log('PlayHQ config static test passed.');
