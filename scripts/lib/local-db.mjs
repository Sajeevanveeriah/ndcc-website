// Shared helper for database-backed migration tests.
//
// Connects with psql using standard PG* env vars (PGHOST may be a socket
// directory, PGPORT, PGUSER). Each test creates a throwaway database,
// applies a shim for Supabase-managed globals (roles, auth.uid(),
// pgcrypto) and then applies real migration files from
// supabase/migrations/ in the order the caller specifies.
//
// CI: run against a postgres service container (PGHOST=localhost).
// Local: any postgres 14+ works, e.g.
//   initdb + pg_ctl -o "-k /var/tmp/ndcc-pgsock -p 5544 -c listen_addresses="
//   PGHOST=/var/tmp/ndcc-pgsock PGPORT=5544 PGUSER=postgres npm run test:...

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');

const baseEnv = {
  ...process.env,
  PGHOST: process.env.PGHOST || '/var/tmp/ndcc-pgsock',
  PGPORT: process.env.PGPORT || '5544',
  PGUSER: process.env.PGUSER || 'postgres',
};

export function psql(database, sql, { expectFailure = false } = {}) {
  try {
    const raw = execFileSync(
      'psql',
      ['-X', '-v', 'ON_ERROR_STOP=1', '-d', database, '-t', '-A', '-F', '\t', '-c', sql],
      { env: baseEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    // Drop command tags (INSERT 0 1, UPDATE 2, ...) that psql prints after
    // RETURNING rows even in tuples-only mode.
    return raw
      .split('\n')
      .filter((line) => !/^(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|NOTIFY)\b/.test(line.trim()))
      .join('\n')
      .trim();
  } catch (err) {
    if (expectFailure) return { failed: true, message: String(err.stderr || err.message) };
    throw new Error(`psql failed: ${String(err.stderr || err.message)}\nSQL: ${sql.slice(0, 400)}`);
  }
}

export function psqlFile(database, filePath) {
  try {
    return execFileSync(
      'psql',
      ['-X', '-v', 'ON_ERROR_STOP=1', '-d', database, '-f', filePath],
      { env: baseEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (err) {
    throw new Error(`Applying ${path.basename(filePath)} failed: ${String(err.stderr || err.message)}`);
  }
}

export function createTestDatabase(name) {
  psql('postgres', `DROP DATABASE IF EXISTS ${name}`);
  psql('postgres', `CREATE DATABASE ${name}`);
  // Shim the Supabase-managed globals the repo migrations assume.
  psql(name, `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
    END $$;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
  `);
  return name;
}

export function applyMigrations(database, filenames) {
  for (const filename of filenames) {
    psqlFile(database, path.join(migrationsDir, filename));
  }
}

export function dropTestDatabase(name) {
  psql('postgres', `DROP DATABASE IF EXISTS ${name}`);
}

let failures = 0;
export function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok - ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL - ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

export function finish(suiteName) {
  if (failures > 0) {
    console.error(`\n${suiteName}: ${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log(`\n${suiteName}: all checks passed`);
}
