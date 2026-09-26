#!/usr/bin/env node
// Full fresh-database replay of the ENTIRE migration lineage in version
// order. This is the invariant that keeps Supabase preview branches and CI
// bootstraps working: every file must apply cleanly to an empty database
// (dashboard-era tables are provided by 20260331000000_prehistory_baseline).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync, readFileSync } from 'node:fs';
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
psql(DB, readFileSync(new URL('./test-reverse-raffle.sql', import.meta.url), 'utf8'));
check('Reverse raffle 201-300 capacity, paid-only allocation, duplicate-event replay and private receipt mappings', true);
psql(DB, readFileSync(new URL('./test-apparel-reminders.sql', import.meta.url), 'utf8'));
check('Apparel reminders include overdue unpaid and part-paid orders, skip ineligible orders and preserve sent cycles', true);
psql(DB, readFileSync(new URL('./test-bank-transfer.sql', import.meta.url), 'utf8'));
check('Bank deposit selections, authorised confirmation, idempotent ticket allocation and receipt eligibility', true);
psql(DB, readFileSync(new URL('./test-club-services.sql', import.meta.url), 'utf8'));
check('Cash sale authorisation, exact price, idempotent tickets, receipt queue and member privacy', true);
psql(DB, readFileSync(new URL('./test-prize-wheel.sql', import.meta.url), 'utf8'));
check('Prize wheel small-raffle limits, picked numbers, sales window, ordered append-only draws and single wins', true);
// Seed only the two reviewed identities in this disposable database, then
// execute the exact data operation intended for release.
const research=JSON.parse(readFileSync(new URL('../data/dino-coach-researched-baselines-20260924.json',import.meta.url),'utf8'));
for(const player of research.players){
 psql(DB, `insert into public.fantasy_players(id,display_name,role) values ('${player.playerId}','${player.name}','BAT');
 insert into public.fantasy_season_players(season_id,player_id,role) select id,'${player.playerId}','BAT' from public.fantasy_seasons where slug='2026-27';
 insert into public.fantasy_player_prices(season_id,player_id,price_dino_dollars,price_million,published_at) select id,'${player.playerId}',${player.previousPriceDinoDollars},${player.previousPriceDinoDollars}/1000000.0,now() from public.fantasy_seasons where slug='2026-27';`);
}
psql(DB,readFileSync(new URL('../supabase/operations/20260924_player_research.sql',import.meta.url),'utf8'));
for(const player of research.players){
 check(`Verified price and audit for ${player.name}`,psql(DB,`select p.price_dino_dollars=${player.priceDinoDollars} and exists(select 1 from public.fantasy_manual_price_audit a where a.player_id=p.player_id and a.old_price=${player.previousPriceDinoDollars} and a.new_price=${player.priceDinoDollars}) from public.fantasy_player_prices p where p.player_id='${player.playerId}'`) === 't');
}
const repeatedResearch=psql(DB,readFileSync(new URL('../supabase/operations/20260924_player_research.sql',import.meta.url),'utf8'),{expectFailure:true});
check('Replaying price operation rejects a changed baseline',repeatedResearch.failed===true&&/Price changed since review/.test(repeatedResearch.message));
const counts = psql(DB, `select (select count(*) from apparel_products where active), (select count(*) from apparel_product_options where active), (select count(*) from merch_payment_settings), (select count(*) from fantasy_seasons)`);
check('fresh replay end-state sane (20 active products, 16 active options, settings row, 3 seasons)', counts === '20\t16\t1\t3', counts);
// Production has RLS enabled on every public table; replays must match.
const rlsOff = psql(DB, `select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
check('RLS enabled on every public table (production parity)', rlsOff === '0', `${rlsOff} tables without RLS`);

const profileRolePolicies = psql(DB, `select count(*) from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~* 'profiles[^;]*role'`);
check(
  'no replayed RLS policy trusts browser-controlled profiles.role',
  profileRolePolicies === '0',
  `${profileRolePolicies} role-dependent policies remain`,
);

const browserWritesOnProfiles = psql(DB, `select count(*)
  from (values ('anon'), ('authenticated')) as roles(role_name)
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as privileges(privilege_name)
  where has_table_privilege(role_name, 'public.profiles', privilege_name)`);
check(
  'browser roles cannot mutate or truncate profiles after replay',
  browserWritesOnProfiles === '0',
  `${browserWritesOnProfiles} browser write privileges remain`,
);
psql(DB, readFileSync(new URL('./test-dino-pricing.sql', import.meta.url), 'utf8'));
check('Dino Coach two-round pricing and manual override regressions', true);
psql(DB, readFileSync(new URL('./test-dino-two-teams.sql', import.meta.url), 'utf8'));
check('Two complete squads, independent saves, captains, budget and unpaid gates', true);
psql(DB, readFileSync(new URL('./test-website-reliability.sql', import.meta.url), 'utf8'));
check('scheduled content RLS, private operational data, recoverable revisions and stale edit protection', true);
psql(DB, readFileSync(new URL('./test-dino-admin-lifecycle.sql', import.meta.url), 'utf8'));
check('Dino admin lifecycle, expiry, waivers, recovery, atomic notifications and permissions', true);
psql(DB, readFileSync(new URL('./test-dino-feedback.sql', import.meta.url), 'utf8'));
check('Dino feedback persistence, duplicate protection, delivery leases and recipient privacy', true);
psql(DB, readFileSync(new URL('./test-dino-no-expiry.sql', import.meta.url), 'utf8'));
check('Dino no-expiry save, consent, account and payment gates', true);
psql(DB, readFileSync(new URL('./test-dino-market.sql', import.meta.url), 'utf8'));
check('Dino wallet pool purchases, sales and disabled inter-team trading', true);
const runPsql = promisify(execFile);
const reservationResults = await Promise.allSettled(Array.from({length:20},()=>runPsql('psql',['-X','-t','-A','-v','ON_ERROR_STOP=1','-d',DB,'-c',
  `insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,selected_ticket_numbers) select id,'Concurrency test','test@example.com',1,6000,array[300] from public.raffle_campaigns where code='NDCCRRO'`],{
  env:{...process.env,PGHOST:process.env.PGHOST||'/var/tmp/ndcc-pgsock',PGPORT:process.env.PGPORT||'5544',PGUSER:process.env.PGUSER||'postgres'},
})));
check('20 concurrent checkouts reserve the same chosen raffle number exactly once',reservationResults.filter(r=>r.status==='fulfilled').length===1);
const rateKey = 'a'.repeat(64);
const calls = await Promise.all(Array.from({ length: 20 }, () => runPsql('psql', ['-X', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', DB, '-c', `select public.ndcc_take_rate_limit('${rateKey}',5,60000)`], {
  env: { ...process.env, PGHOST: process.env.PGHOST || '/var/tmp/ndcc-pgsock', PGPORT: process.env.PGPORT || '5544', PGUSER: process.env.PGUSER || 'postgres' },
})));
check('20 concurrent callers share exactly 5 permits', calls.filter((call) => call.stdout.trim() === 't').length === 5);
psql(DB, `update public.request_rate_limits set expires_at=now()-interval '1 second' where key_hash='${rateKey}'`);
check('expired rate window admits a fresh request', psql(DB, `select public.ndcc_take_rate_limit('${rateKey}',5,60000)`) === 't');
dropTestDatabase(DB);
finish('full-replay');
