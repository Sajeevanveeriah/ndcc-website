import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260712100000_club_seasons.sql', 'utf8');
assert.match(migration, /CREATE TABLE IF NOT EXISTS club_seasons/);
assert.match(migration, /club_seasons_one_current_idx[\s\S]+WHERE is_current/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS club_season_teams/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS club_season_playhq_grade_mappings/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS club_season_playhq_team_mappings/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS club_season_training_schedules/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS club_season_registration_settings/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS club_season_notices/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS club_season_fantasy_links/);
assert.match(migration, /ALTER TABLE teams ADD COLUMN IF NOT EXISTS club_season_id/);
assert.match(migration, /ALTER TABLE season_appointments ADD COLUMN IF NOT EXISTS club_season_id/);
assert.match(migration, /ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS club_season_id/);
assert.match(migration, /ALTER TABLE merch_order_windows ADD COLUMN IF NOT EXISTS club_season_id/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /Rollback:/);
assert.doesNotMatch(migration, /DROP TABLE teams/);
console.log('Club seasons schema checks passed.');

const access = readFileSync('lib/club-seasons.ts', 'utf8');
assert.match(access, /CLUB_SEASON_COLUMNS/);
assert.match(access, /slugifySeasonName/);
const api = readFileSync('app/api/admin/club-seasons/route.ts', 'utf8');
assert.match(api, /requireSession/);
assert.match(api, /club_seasons/);
