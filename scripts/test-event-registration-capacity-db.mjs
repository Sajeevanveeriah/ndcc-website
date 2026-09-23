#!/usr/bin/env node
// Database-backed test for ndcc_register_event_attendee (migration
// 20260923054733_event_registration_capacity_guard.sql). Replays every
// migration into a throwaway local database (see scripts/lib/local-db.mjs for
// PGHOST/PGPORT setup) and never connects to a hosted project.
import { readdirSync, readFileSync } from 'node:fs';
import { createTestDatabase, dropTestDatabase, applyMigrations, psql, check, finish, migrationsDir } from './lib/local-db.mjs';

const DB = 'ndcc_event_capacity_guard';
const MIGRATION = '20260923054733_event_registration_capacity_guard.sql';
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

const source = readFileSync(`${migrationsDir}/${MIGRATION}`, 'utf8').replace(/--.*$/gm, '');
check('function is SECURITY DEFINER with an empty search_path', /security definer/i.test(source) && /set search_path = ''/i.test(source));
check('browser roles lose execute', /revoke all on function public\.ndcc_register_event_attendee\([^)]*\) from public, anon, authenticated/i.test(source));
check('service_role keeps execute', /grant execute on function public\.ndcc_register_event_attendee\([^)]*\) to service_role/i.test(source));
check('event row is locked before counting', /for update/i.test(source));
check('migration is atomic', /^\s*begin;/im.test(source) && /commit;\s*$/i.test(source));

createTestDatabase(DB);
try {
  applyMigrations(DB, files);
  const eventId = psql(DB, `insert into public.events(title, date, capacity, published) values ('Capacity test', now() + interval '7 days', 5, true) returning id`);
  const pastId = psql(DB, `insert into public.events(title, date, capacity, published) values ('Past test', now() - interval '1 hour', null, true) returning id`);
  const openId = psql(DB, `insert into public.events(title, date, capacity, published) values ('Open test', now() + interval '7 days', null, true) returning id`);
  const draftId = psql(DB, `insert into public.events(title, date, capacity, published) values ('Draft test', now() + interval '7 days', null, false) returning id`);
  const register = (id, qty, status = 'not_required') => psql(DB,
    `select public.ndcc_register_event_attendee('${id}', 'Test', 't@example.invalid', '0400000000', ${qty}, '${status}', null, null)`,
    { expectFailure: true });

  const first = register(eventId, 3);
  check('registration within capacity succeeds', typeof first === 'string' && /^[0-9a-f-]{36}$/.test(first), JSON.stringify(first));
  const over = register(eventId, 3);
  check('registration beyond capacity is refused', over.failed === true && /capacity reached/.test(over.message), JSON.stringify(over));
  psql(DB, `insert into public.event_registrations(event_id, name, email, quantity, payment_status) values ('${eventId}', 'Old', 'o@example.invalid', 10, 'cancelled')`);
  const fill = register(eventId, 2, 'pending_bank_transfer');
  check('cancelled registrations do not consume capacity; exact fill allowed', typeof fill === 'string', JSON.stringify(fill));
  const full = register(eventId, 1);
  check('a full event refuses one more place', full.failed === true && /capacity reached/.test(full.message));
  const past = register(pastId, 1);
  check('events that have started are closed', past.failed === true && /closed/.test(past.message));
  const draft = register(draftId, 1);
  check('unpublished events are refused', draft.failed === true && /not found/.test(draft.message));
  check('uncapped events accept registrations', typeof register(openId, 20) === 'string');
  const badStatus = register(openId, 1, 'paid');
  check('callers cannot pre-mark a registration as paid', badStatus.failed === true);
  const total = psql(DB, `select sum(quantity) from public.event_registrations where event_id = '${eventId}' and payment_status <> 'cancelled'`);
  check('capacity total is exactly the event capacity', total === '5', total);
  const anonExec = psql(DB, `select has_function_privilege('anon', 'public.ndcc_register_event_attendee(uuid,text,text,text,integer,text,text,uuid)', 'execute')`);
  const authExec = psql(DB, `select has_function_privilege('authenticated', 'public.ndcc_register_event_attendee(uuid,text,text,text,integer,text,text,uuid)', 'execute')`);
  const serviceExec = psql(DB, `select has_function_privilege('service_role', 'public.ndcc_register_event_attendee(uuid,text,text,text,integer,text,text,uuid)', 'execute')`);
  check('anon/authenticated cannot execute; service_role can', anonExec === 'f' && authExec === 'f' && serviceExec === 't', `${anonExec}/${authExec}/${serviceExec}`);
} finally {
  dropTestDatabase(DB);
}
finish('event-registration-capacity-db');
