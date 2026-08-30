#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260830020000_dino_coach_rls_hardening.sql',
  'utf8',
);
const normalised = migration.replace(/--.*$/gm, '').replace(/\s+/g, ' ');

for (const [table, policy] of [
  ['fantasy_managers', 'fantasy_managers_owner_insert'],
  ['fantasy_managers', 'fantasy_managers_owner_update'],
  ['fantasy_squads', 'fantasy_squads_owner_all'],
  ['fantasy_squad_players', 'fantasy_squad_players_owner_all'],
  ['fantasy_transfers', 'fantasy_transfers_owner_insert'],
  ['fantasy_chips', 'fantasy_chips_owner_all'],
  ['fantasy_leagues', 'fantasy_leagues_owner_insert'],
  ['fantasy_league_members', 'fantasy_league_members_owner_insert'],
]) {
  assert.match(
    normalised,
    new RegExp(`DROP POLICY IF EXISTS ${policy} ON public\\.${table}`, 'i'),
    `${policy} must be removed`,
  );
}

for (const [table, policy] of [
  ['fantasy_squads', 'fantasy_squads_owner_read'],
  ['fantasy_squad_players', 'fantasy_squad_players_owner_read'],
  ['fantasy_chips', 'fantasy_chips_owner_read'],
]) {
  assert.match(
    normalised,
    new RegExp(`CREATE POLICY ${policy} ON public\\.${table} FOR SELECT TO authenticated`, 'i'),
    `${table} must retain owner-only SELECT access`,
  );
}

const legacyTables = [
  'fantasy_settings',
  'fantasy_managers',
  'fantasy_squads',
  'fantasy_squad_players',
  'fantasy_transfers',
  'fantasy_chips',
  'fantasy_leagues',
  'fantasy_league_members',
  'fantasy_manager_round_scores',
];

const revokeBlock = normalised.match(/REVOKE ALL PRIVILEGES ON TABLE (.*?) FROM PUBLIC, anon, authenticated;/i)?.[1];
assert.ok(revokeBlock, 'PUBLIC, anon and authenticated must lose all direct table privileges');
const selectBlock = normalised.match(/GRANT SELECT ON TABLE (.*?) TO authenticated;/i)?.[1];
assert.ok(selectBlock, 'authenticated must regain table-level SELECT privilege');

for (const table of legacyTables) {
  assert.match(revokeBlock, new RegExp(`(?:^|[, ])public\\.${table}(?:[, ]|$)`, 'i'), `${table} writes must be revoked`);
  assert.match(selectBlock, new RegExp(`(?:^|[, ])public\\.${table}(?:[, ]|$)`, 'i'), `${table} SELECT must be retained`);
}

assert.match(
  normalised,
  /REVOKE ALL PRIVILEGES ON TABLE .* FROM PUBLIC, anon, authenticated;/i,
  'PUBLIC, anon and authenticated must lose direct table privileges',
);
assert.match(
  normalised,
  /GRANT SELECT ON TABLE .* TO authenticated;/i,
  'authenticated owner reads must retain table-level SELECT privilege',
);
assert.doesNotMatch(normalised, /REVOKE SELECT .* FROM .*authenticated/i, 'authenticated SELECT must not be revoked');
assert.doesNotMatch(normalised, /(?:REVOKE|FROM) [^;]*service_role/i, 'service-role privileges must remain unchanged');
assert.match(normalised, /BEGIN;.*COMMIT;/i, 'policy replacement and grants must be atomic');

console.log('Dino Coach RLS hardening structural checks passed.');
