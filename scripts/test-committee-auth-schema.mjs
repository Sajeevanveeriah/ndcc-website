import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const repairPath = path.join(root, 'supabase/migrations/20260630_repair_committee_auth_pgcrypto.sql');
const originalPath = path.join(root, 'supabase/migrations/20260401_custom_committee_auth.sql');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) fail(`${label} missing: ${needle}`);
}

if (!fs.existsSync(repairPath)) fail('Repair migration does not exist.');

const repair = fs.readFileSync(repairPath, 'utf8');
const original = fs.readFileSync(originalPath, 'utf8');
const repairLower = repair.toLowerCase();

assertIncludes(repair, 'CREATE EXTENSION IF NOT EXISTS pgcrypto', 'Repair migration');
assertIncludes(repair, 'CREATE TABLE IF NOT EXISTS public.committee_users', 'Repair migration');
assertIncludes(repair, 'CREATE TABLE IF NOT EXISTS public.committee_sessions', 'Repair migration');
assertIncludes(repair, 'SET search_path = public, extensions', 'Repair migration');
assertIncludes(repair, 'CREATE OR REPLACE FUNCTION public.ndcc_verify_committee_user', 'Repair migration');
assertIncludes(repair, 'CREATE OR REPLACE FUNCTION public.ndcc_set_committee_password', 'Repair migration');
assertIncludes(repair, 'CREATE OR REPLACE FUNCTION public.ndcc_admin_create_committee_user', 'Repair migration');
assertIncludes(repair, 'CREATE OR REPLACE FUNCTION public.ndcc_bootstrap_first_admin', 'Repair migration');
assertIncludes(repair, 'GRANT EXECUTE ON FUNCTION public.ndcc_verify_committee_user(TEXT, TEXT) TO service_role', 'Repair migration');

if (/\bdrop\s+table\b/i.test(repair)) fail('Repair migration must not contain DROP TABLE.');
if (/\btruncate\b/i.test(repair)) fail('Repair migration must not contain TRUNCATE.');

const forbiddenPasswordLiterals = [
  /password\s*[:=]\s*['"][^'"]+['"]/i,
  /p_password\s*=>\s*['"][^'"]+['"]/i,
  /crypt\(\s*['"][^'"]+['"]/i,
  /gen_salt\([^)]*\)\s*;\s*--\s*password/i,
];
for (const pattern of forbiddenPasswordLiterals) {
  if (pattern.test(repair)) fail(`Repair migration appears to contain a committed password literal matching ${pattern}.`);
}

for (const functionName of [
  'ndcc_verify_committee_user',
  'ndcc_set_committee_password',
  'ndcc_admin_create_committee_user',
  'ndcc_bootstrap_first_admin',
]) {
  const pattern = new RegExp(`CREATE OR REPLACE FUNCTION\\s+(?:public\\.)?${functionName}[\\s\\S]*?SET search_path = public, extensions`, 'i');
  if (!pattern.test(original)) fail(`Original auth migration does not future-proof ${functionName} with public, extensions search_path.`);
}

if (repairLower.includes('playhq')) fail('Committee auth repair must not include PlayHQ changes.');

console.log('Committee auth schema static test passed.');
