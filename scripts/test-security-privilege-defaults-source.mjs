#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const migrationPath = 'supabase/migrations/20260830130837_security_privilege_defaults_hardening.sql';
assert.equal(existsSync(migrationPath), true, 'the forward security migration must exist');
assert.equal(
  existsSync('app/api/admin/auth/bootstrap/route.ts'),
  false,
  'the retired HTTP bootstrap route must not be present',
);

const sql = readFileSync(migrationPath, 'utf8')
  .replace(/--.*$/gm, '')
  .replace(/\s+/g, ' ');

for (const signature of [
  'public.crypt(text, text)',
  'public.gen_salt(text)',
  'public.gen_salt(text, integer)',
]) {
  const escaped = signature.replace(/[().]/g, '\\$&').replace(/ /g, '\\s*');
  assert.match(
    sql,
    new RegExp(`REVOKE EXECUTE ON FUNCTION ${escaped} FROM PUBLIC, anon, authenticated`, 'i'),
    `${signature} must lose browser execution before removal`,
  );
  assert.match(
    sql,
    new RegExp(`DROP FUNCTION IF EXISTS ${escaped}`, 'i'),
    `${signature} must be removed restrictively`,
  );
}

assert.match(
  sql,
  /REVOKE EXECUTE ON FUNCTION public\.ndcc_bootstrap_first_admin\(text,\s*text,\s*text\) FROM PUBLIC, anon, authenticated, service_role/i,
  'the one-time bootstrap must lose every callable application role',
);
assert.match(
  sql,
  /DROP FUNCTION IF EXISTS public\.ndcc_bootstrap_first_admin\(text,\s*text,\s*text\)/i,
  'the one-time bootstrap function must be retired',
);

for (const objectType of ['TABLES', 'SEQUENCES']) {
  assert.match(
    sql,
    new RegExp(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON ${objectType} FROM PUBLIC, anon, authenticated`, 'i'),
    `future ${objectType.toLowerCase()} must not inherit browser privileges`,
  );
  assert.match(
    sql,
    new RegExp(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL PRIVILEGES ON ${objectType} TO service_role`, 'i'),
    `service_role must retain future ${objectType.toLowerCase()} access`,
  );
}

assert.match(
  sql,
  /ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/i,
  'future functions must not inherit global PUBLIC execution',
);
assert.match(
  sql,
  /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated/i,
  'future public functions must not inherit schema-specific browser execution',
);
assert.match(
  sql,
  /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role/i,
  'service_role must retain future function execution',
);
assert.doesNotMatch(
  sql,
  /GRANT\s+(?:ALL(?: PRIVILEGES)?|EXECUTE|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)[^;]*\b(?:anon|authenticated)\b/i,
  'the migration must not grant browser write or execute privileges',
);
assert.match(sql, /BEGIN;.*COMMIT;/i, 'all hardening changes must be atomic');

const readme = readFileSync('README.md', 'utf8');
assert.doesNotMatch(readme, /POST\s+\/api\/admin\/auth\/bootstrap/i, 'documentation must not advertise the retired endpoint');
const csrfSource = readFileSync('lib/auth/csrf.ts', 'utf8');
assert.doesNotMatch(csrfSource, /\/api\/admin\/auth\/bootstrap/i, 'CSRF exemptions must not retain the retired endpoint');

console.log('Security privilege-default hardening source checks passed.');
