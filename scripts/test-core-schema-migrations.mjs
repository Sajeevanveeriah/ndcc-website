import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationsDir = path.join(root, 'supabase/migrations');
const repairPath = path.join(migrationsDir, '20260630000400_repair_core_schema_dependencies.sql');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) fail(`${label} missing: ${needle}`);
}

if (!fs.existsSync(repairPath)) fail('Core schema repair migration does not exist.');

const repair = read(repairPath);
const repairLower = repair.toLowerCase();

assertIncludes(repair, 'CREATE EXTENSION IF NOT EXISTS pgcrypto', 'Core schema repair migration');
assertIncludes(repair, 'CREATE TABLE IF NOT EXISTS public.orders', 'Core schema repair migration');
assertIncludes(repair, 'CREATE TABLE IF NOT EXISTS public.committee_users', 'Core schema repair migration');
assertIncludes(repair, 'CREATE TABLE IF NOT EXISTS public.committee_sessions', 'Core schema repair migration');
assertIncludes(repair, 'CREATE TABLE IF NOT EXISTS public.member_applications', 'Core schema repair migration');
assertIncludes(repair, 'CREATE TABLE IF NOT EXISTS public.member_addon_selections', 'Core schema repair migration');
assertIncludes(repair, 'CREATE TABLE IF NOT EXISTS public.imported_transactions', 'Core schema repair migration');
assertIncludes(repair, 'CREATE TABLE IF NOT EXISTS public.bank_transfer_confirmations', 'Core schema repair migration');
assertIncludes(repair, 'SET search_path = public, extensions', 'Core schema repair migration');

for (const column of [
  'id',
  'customer_name',
  'customer_email',
  'customer_phone',
  'items',
  'total_amount',
  'payment_status',
  'stripe_session_id',
  'processed',
  'notes',
  'created_at',
  'order_status',
  'payment_reference',
  'bank_reference_used',
  'confirmed_by',
  'confirmed_at',
  'needs_review_reason',
  'order_category',
  'merch_window_id',
  'merch_window_label',
]) {
  if (!new RegExp(`\\b${column}\\b`, 'i').test(repair)) fail(`Core schema repair migration missing orders column ${column}.`);
}

if (/\bdrop\s+table\b/i.test(repair)) fail('Core schema repair migration must not contain DROP TABLE.');
if (/\btruncate\b/i.test(repair)) fail('Core schema repair migration must not contain TRUNCATE.');
if (/password\s*[:=]\s*['"][^'"]+['"]/i.test(repair)) fail('Core schema repair migration appears to contain a committed password literal.');
if (/playhq[_-]?(api)?[_-]?(key|token|secret)\s*[:=]/i.test(repairLower)) fail('Core schema repair migration appears to contain PlayHQ API credentials.');

const migrationFiles = fs.readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

for (const file of migrationFiles) {
  const fullPath = path.join(migrationsDir, file);
  const sql = read(fullPath);
  const lower = sql.toLowerCase();
  const firstOrdersReference = lower.search(/references\s+(?:public\.)?orders\s*\(\s*id\s*\)/);
  if (firstOrdersReference !== -1) {
    const before = lower.slice(0, firstOrdersReference);
    const hasOrdersCreate = /create\s+table\s+if\s+not\s+exists\s+(?:public\.)?orders\b/.test(before);
    const isGuarded = /if\s+not\s+exists[\s\S]{0,500}add\s+constraint[\s\S]{0,500}references\s+(?:public\.)?orders\s*\(\s*id\s*\)/.test(lower);
    if (!hasOrdersCreate && !isGuarded) fail(`${file} references orders(id) before creating orders or using a guarded FK.`);
  }

  const firstAlterOrders = lower.search(/alter\s+table\s+(?:public\.)?orders\b/);
  if (firstAlterOrders !== -1) {
    const before = lower.slice(0, firstAlterOrders);
    if (!/create\s+table\s+if\s+not\s+exists\s+(?:public\.)?orders\b/.test(before)) {
      fail(`${file} alters orders before ensuring orders exists.`);
    }
  }
}

const authMigration = read(path.join(migrationsDir, '20260401000000_custom_committee_auth.sql'));
for (const functionName of [
  'ndcc_verify_committee_user',
  'ndcc_set_committee_password',
  'ndcc_admin_create_committee_user',
  'ndcc_bootstrap_first_admin',
]) {
  const pattern = new RegExp(`CREATE OR REPLACE FUNCTION\\s+(?:public\\.)?${functionName}[\\s\\S]*?SET search_path = public, extensions`, 'i');
  if (!pattern.test(authMigration)) fail(`Committee auth migration does not use public, extensions search_path for ${functionName}.`);
  if (!pattern.test(repair)) fail(`Core schema repair migration does not use public, extensions search_path for ${functionName}.`);
}

console.log('Core schema migration static test passed.');
