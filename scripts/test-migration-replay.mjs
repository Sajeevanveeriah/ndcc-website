#!/usr/bin/env node
// Full fresh-database replay of the ENTIRE migration lineage in version
// order. This is the invariant that keeps Supabase preview branches and CI
// bootstraps working: every file must apply cleanly to an empty database
// (dashboard-era tables are provided by 20260331000000_prehistory_baseline).
import { readdirSync } from 'node:fs';
import { createTestDatabase, dropTestDatabase, applyMigrations, psql, check, finish, migrationsDir } from './lib/local-db.mjs';
const DB = 'ndcc_full_replay';
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
console.log(`Replaying ${files.length} migrations in version order...`);
createTestDatabase(DB);
let applied = 0;
for (const f of files) {
  try {
    applyMigrations(DB, [f]);
    applied++;
  } catch (err) {
    console.error(`\nFAILED at ${f}:\n${String(err.message).slice(0, 600)}`);
    process.exit(1);
  }
}
console.log(`All ${applied} migrations applied cleanly.`);
const counts = psql(DB, `select (select count(*) from apparel_products where active), (select count(*) from apparel_product_options where active), (select count(*) from merch_payment_settings), (select count(*) from fantasy_seasons)`);
check('fresh replay end-state sane (20 active products, 16 active options, settings row, 3 seasons)', counts === '20\t16\t1\t3', counts);
// Production has RLS enabled on every public table; replays must match.
const rlsOff = psql(DB, `select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
check('RLS enabled on every public table (production parity)', rlsOff === '0', `${rlsOff} tables without RLS`);
dropTestDatabase(DB);
finish('full-replay');
