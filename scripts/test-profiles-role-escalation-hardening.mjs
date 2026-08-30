#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260830021000_profiles_role_escalation_hardening.sql',
  'utf8',
);
const sql = migration.replace(/--.*$/gm, '').replace(/\s+/g, ' ');

const retiredPolicies = {
  profiles: ['profiles_select', 'profiles_insert', 'profiles_update', 'profiles_delete'],
  club_settings: ['club_settings_delete', 'club_settings_insert', 'club_settings_select', 'club_settings_update'],
  contacts: ['contacts_delete', 'contacts_select', 'contacts_update'],
  event_registrations: ['event_registrations_delete', 'event_registrations_select', 'event_registrations_update'],
  events: ['events_delete', 'events_insert', 'events_select', 'events_update'],
  news: ['news_delete', 'news_insert', 'news_select', 'news_update'],
  orders: ['orders_delete', 'orders_select', 'orders_update'],
  sponsors: ['sponsors_delete', 'sponsors_insert', 'sponsors_select', 'sponsors_update'],
  teams: ['teams_delete', 'teams_insert', 'teams_select', 'teams_update'],
  volunteers: ['volunteers_delete', 'volunteers_select', 'volunteers_update'],
};

for (const [table, policies] of Object.entries(retiredPolicies)) {
  for (const policy of policies) {
    assert.match(
      sql,
      new RegExp(`DROP POLICY IF EXISTS ${policy} ON public\\.${table}`, 'i'),
      `${table}.${policy} must be retired`,
    );
  }
}

for (const [table, policies] of Object.entries({
  club_settings: [
    'Public can read club settings',
    'Admins have full access to club settings',
    'Committee can read club settings',
  ],
  teams: [
    'Public can read active teams',
    'Admins have full access to teams',
    'Committee can read teams',
  ],
})) {
  for (const policy of policies) {
    assert.match(
      migration,
      new RegExp(`DROP POLICY IF EXISTS "${policy}" ON public\\.${table}`, 'i'),
      `${table} legacy policy "${policy}" must be retired on a fresh replay`,
    );
  }
}

assert.match(
  sql,
  /CREATE POLICY profiles_select ON public\.profiles FOR SELECT TO authenticated USING \(id = auth\.uid\(\)\);/i,
  'authenticated users must retain own-profile read access only',
);

for (const [table, predicate] of [
  ['club_settings', "id = 'default'"],
  ['events', 'published = true'],
  ['news', 'published = true'],
  ['sponsors', 'active = true'],
  ['teams', 'is_active = true'],
]) {
  assert.match(
    sql,
    new RegExp(`CREATE POLICY ${table}_select ON public\\.${table} FOR SELECT TO anon, authenticated USING \\(${predicate}\\);`, 'i'),
    `${table} must retain its public projection`,
  );
}

for (const table of ['contacts', 'event_registrations', 'orders', 'volunteers']) {
  assert.doesNotMatch(
    sql,
    new RegExp(`CREATE POLICY [^;]+ ON public\\.${table}`, 'i'),
    `${table} must not regain browser-readable policies`,
  );
}

const protectedTables = Object.keys(retiredPolicies);
const revokeBlock = sql.match(
  /REVOKE ALL PRIVILEGES ON TABLE (.*?) FROM PUBLIC, anon, authenticated;/i,
)?.[1];
assert.ok(revokeBlock, 'PUBLIC, anon and authenticated must lose all table privileges');

for (const table of protectedTables) {
  assert.match(
    revokeBlock,
    new RegExp(`(?:^|[, ])public\\.${table}(?:[, ]|$)`, 'i'),
    `${table} browser-role privileges must be revoked`,
  );
}

assert.match(
  sql,
  /GRANT SELECT ON TABLE public\.profiles TO authenticated;/i,
  'authenticated must regain profile SELECT',
);

const publicSelectBlock = sql.match(
  /GRANT SELECT ON TABLE (public\.club_settings.*?) TO anon, authenticated;/i,
)?.[1];
assert.ok(publicSelectBlock, 'public content tables must regain SELECT');
for (const table of ['club_settings', 'events', 'news', 'sponsors', 'teams']) {
  assert.match(
    publicSelectBlock,
    new RegExp(`(?:^|[, ])public\\.${table}(?:[, ]|$)`, 'i'),
    `${table} must retain table-level public SELECT`,
  );
}

assert.doesNotMatch(
  sql,
  /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE|TRUNCATE|TRIGGER|REFERENCES)/i,
  'the migration must not restore browser writes or non-read privileges',
);
assert.doesNotMatch(sql, /CREATE POLICY [^;]+\b(?:INSERT|UPDATE|DELETE|ALL)\b/i, 'no write policy may be recreated');
assert.doesNotMatch(sql, /(?:REVOKE|FROM) [^;]*service_role/i, 'service-role privileges must remain unchanged');
assert.match(
  sql,
  /FROM pg_catalog\.pg_policies[\s\S]*?tablename IN[\s\S]*?profiles[\s\S]*?RAISE EXCEPTION/i,
  'the database must abort if an unexpected protected-table policy still depends on profiles',
);
assert.match(sql, /BEGIN;.*COMMIT;/i, 'policy and privilege changes must be atomic');

console.log('Profiles role-escalation hardening structural checks passed.');
