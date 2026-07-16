-- Fantasy multi-season architecture (additive + reversible).
--
-- 1. fantasy_seasons + fantasy_season_players (durable player identity stays in
--    fantasy_players; per-season availability/role lives in season players).
-- 2. season_id added and backfilled on all season-scoped fantasy tables.
--    Provenance rules for existing production rows:
--      * fantasy_rounds 1-2 carry Oct 2026 deadlines, so they belong to 2026/27.
--      * fantasy_player_prices are the operative live prices for current squad
--        building (and reference those rounds), so they follow 2026/27.
--      * fantasy_match_stats + fantasy_import_batches came from a manual CSV
--        with no PlayHQ provenance, so they move to the non-public
--        "Legacy / Unverified" season, NOT 2025/26.
-- 3. Season-aware uniqueness replaces global uniqueness (round numbers, chips,
--    league codes, squads, manager round scores, prices, match stats).
-- 4. PlayHQ provenance columns, season grade sources and resumable sync jobs.
-- 5. Fantasy RLS policies (public read of public-season data only; all writes
--    stay server-side via service role) and a fixed search_path on
--    set_fantasy_updated_at.
--
-- Rollback: see docs/operations/20260710-NDCC-Fantasy-Seasons-PlayHQ-Run-Rev00.md
-- (drop the new tables/columns/policies; original constraints are recreated).

-- ---------------------------------------------------------------------------
-- 1. Seasons
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fantasy_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  playhq_season_id TEXT UNIQUE,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','upcoming','active','completed','archived')),
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  allow_team_building BOOLEAN NOT NULL DEFAULT FALSE,
  registration_open BOOLEAN NOT NULL DEFAULT FALSE,
  team_selection_open BOOLEAN NOT NULL DEFAULT FALSE,
  last_playhq_sync_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_seasons_single_current_idx
  ON fantasy_seasons (is_current) WHERE is_current;

DROP TRIGGER IF EXISTS trg_fantasy_seasons_updated_at ON fantasy_seasons;
CREATE TRIGGER trg_fantasy_seasons_updated_at
BEFORE UPDATE ON fantasy_seasons
FOR EACH ROW EXECUTE FUNCTION set_fantasy_updated_at();

INSERT INTO fantasy_seasons (name, slug, status, is_current, is_public, allow_team_building, registration_open, team_selection_open)
SELECT 'Legacy / Unverified', 'legacy-unverified', 'archived', FALSE, FALSE, FALSE, FALSE, FALSE
WHERE NOT EXISTS (SELECT 1 FROM fantasy_seasons WHERE slug = 'legacy-unverified');

INSERT INTO fantasy_seasons (name, slug, status, start_date, end_date, is_current, is_public, allow_team_building, registration_open, team_selection_open)
SELECT 'NDCC Fantasy 2025/2026', '2025-26', 'completed', DATE '2025-10-01', DATE '2026-03-31', FALSE, TRUE, FALSE, FALSE, FALSE
WHERE NOT EXISTS (SELECT 1 FROM fantasy_seasons WHERE slug = '2025-26');

INSERT INTO fantasy_seasons (name, slug, status, start_date, end_date, is_current, is_public, allow_team_building, registration_open, team_selection_open)
SELECT 'NDCC Fantasy 2026/2027', '2026-27', 'upcoming', DATE '2026-10-01', DATE '2027-03-31', TRUE, TRUE, TRUE, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM fantasy_seasons WHERE is_current);

-- ---------------------------------------------------------------------------
-- 2. Season players (per-season availability/classification)
-- ---------------------------------------------------------------------------
ALTER TABLE fantasy_players DROP CONSTRAINT IF EXISTS fantasy_players_role_check;
ALTER TABLE fantasy_players ADD CONSTRAINT fantasy_players_role_check
  CHECK (role IN ('WK','BAT','AR','BOWL','UNASSIGNED'));

CREATE TABLE IF NOT EXISTS fantasy_season_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES fantasy_seasons(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES fantasy_players(id) ON DELETE CASCADE,
  playhq_player_id TEXT,
  team_label TEXT,
  grade_label TEXT,
  role TEXT NOT NULL DEFAULT 'UNASSIGNED' CHECK (role IN ('WK','BAT','AR','BOWL','UNASSIGNED')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  selectable BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'manual',
  source_url TEXT,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  carried_from_season_player_id UUID REFERENCES fantasy_season_players(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (season_id, player_id)
);

DROP TRIGGER IF EXISTS trg_fantasy_season_players_updated_at ON fantasy_season_players;
CREATE TRIGGER trg_fantasy_season_players_updated_at
BEFORE UPDATE ON fantasy_season_players
FOR EACH ROW EXECUTE FUNCTION set_fantasy_updated_at();

-- Backfill memberships: every existing player belongs to the legacy season;
-- currently-active players also stay selectable in the current (2026/27)
-- season so live squad building keeps working exactly as before.
INSERT INTO fantasy_season_players (season_id, player_id, playhq_player_id, team_label, role, active, selectable, source, first_seen_at)
SELECT s.id, p.id, p.playhq_player_id, p.team_label, p.role, p.active, FALSE, 'legacy_backfill', p.created_at
FROM fantasy_players p
CROSS JOIN (SELECT id FROM fantasy_seasons WHERE slug = 'legacy-unverified') s
ON CONFLICT (season_id, player_id) DO NOTHING;

INSERT INTO fantasy_season_players (season_id, player_id, playhq_player_id, team_label, role, active, selectable, source, first_seen_at)
SELECT s.id, p.id, p.playhq_player_id, p.team_label, p.role, p.active, p.active, 'legacy_backfill', p.created_at
FROM fantasy_players p
CROSS JOIN (SELECT id FROM fantasy_seasons WHERE is_current) s
ON CONFLICT (season_id, player_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. season_id columns + backfill
-- ---------------------------------------------------------------------------
ALTER TABLE fantasy_settings ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES fantasy_seasons(id) ON DELETE CASCADE;
ALTER TABLE fantasy_rounds ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES fantasy_seasons(id) ON DELETE CASCADE;
ALTER TABLE fantasy_player_prices ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES fantasy_seasons(id) ON DELETE CASCADE;
ALTER TABLE fantasy_import_batches ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES fantasy_seasons(id) ON DELETE SET NULL;
ALTER TABLE fantasy_match_stats ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES fantasy_seasons(id) ON DELETE CASCADE;
ALTER TABLE fantasy_squads ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES fantasy_seasons(id) ON DELETE CASCADE;
ALTER TABLE fantasy_transfers ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES fantasy_seasons(id) ON DELETE CASCADE;
ALTER TABLE fantasy_chips ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES fantasy_seasons(id) ON DELETE CASCADE;
ALTER TABLE fantasy_leagues ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES fantasy_seasons(id) ON DELETE CASCADE;
ALTER TABLE fantasy_manager_round_scores ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES fantasy_seasons(id) ON DELETE CASCADE;

UPDATE fantasy_settings SET season_id = (SELECT id FROM fantasy_seasons WHERE is_current) WHERE season_id IS NULL;
UPDATE fantasy_rounds SET season_id = (SELECT id FROM fantasy_seasons WHERE is_current) WHERE season_id IS NULL;
UPDATE fantasy_player_prices SET season_id = (SELECT id FROM fantasy_seasons WHERE is_current) WHERE season_id IS NULL;
UPDATE fantasy_import_batches SET season_id = (SELECT id FROM fantasy_seasons WHERE slug = 'legacy-unverified') WHERE season_id IS NULL;
UPDATE fantasy_match_stats SET season_id = (SELECT id FROM fantasy_seasons WHERE slug = 'legacy-unverified') WHERE season_id IS NULL;
-- Squad-lifecycle tables were empty at migration time; follow the round's
-- season when present, otherwise the current season.
UPDATE fantasy_squads sq SET season_id = COALESCE((SELECT r.season_id FROM fantasy_rounds r WHERE r.id = sq.round_id), (SELECT id FROM fantasy_seasons WHERE is_current)) WHERE sq.season_id IS NULL;
UPDATE fantasy_transfers t SET season_id = COALESCE((SELECT r.season_id FROM fantasy_rounds r WHERE r.id = t.round_id), (SELECT id FROM fantasy_seasons WHERE is_current)) WHERE t.season_id IS NULL;
UPDATE fantasy_chips c SET season_id = COALESCE((SELECT r.season_id FROM fantasy_rounds r WHERE r.id = c.round_id), (SELECT id FROM fantasy_seasons WHERE is_current)) WHERE c.season_id IS NULL;
UPDATE fantasy_leagues SET season_id = (SELECT id FROM fantasy_seasons WHERE is_current) WHERE season_id IS NULL;
UPDATE fantasy_manager_round_scores ms SET season_id = COALESCE((SELECT r.season_id FROM fantasy_rounds r WHERE r.id = ms.round_id), (SELECT id FROM fantasy_seasons WHERE is_current)) WHERE ms.season_id IS NULL;

ALTER TABLE fantasy_settings ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE fantasy_rounds ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE fantasy_player_prices ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE fantasy_match_stats ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE fantasy_squads ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE fantasy_transfers ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE fantasy_chips ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE fantasy_leagues ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE fantasy_manager_round_scores ALTER COLUMN season_id SET NOT NULL;

-- One settings row per season; seed rows for seasons that lack one.
CREATE UNIQUE INDEX IF NOT EXISTS fantasy_settings_season_uniq ON fantasy_settings (season_id);
INSERT INTO fantasy_settings (season_name, season_id, is_registration_open, is_team_selection_open)
SELECT s.name, s.id, s.registration_open, s.team_selection_open
FROM fantasy_seasons s
WHERE NOT EXISTS (SELECT 1 FROM fantasy_settings fs WHERE fs.season_id = s.id);

-- ---------------------------------------------------------------------------
-- 4. Season-aware uniqueness + provenance
-- ---------------------------------------------------------------------------
ALTER TABLE fantasy_rounds DROP CONSTRAINT IF EXISTS fantasy_rounds_round_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS fantasy_rounds_season_round_number_uniq ON fantasy_rounds (season_id, round_number);

ALTER TABLE fantasy_match_stats
  ADD COLUMN IF NOT EXISTS playhq_game_id TEXT,
  ADD COLUMN IF NOT EXISTS playhq_fixture_id TEXT,
  ADD COLUMN IF NOT EXISTS playhq_round_number INTEGER,
  ADD COLUMN IF NOT EXISTS playhq_round_name TEXT,
  ADD COLUMN IF NOT EXISTS source_hash TEXT,
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_match_stats_season_game_player_uniq
  ON fantasy_match_stats (season_id, playhq_game_id, player_id) WHERE playhq_game_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_player_prices_season_player_round_uniq
  ON fantasy_player_prices (season_id, player_id, effective_round_id) WHERE effective_round_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fantasy_player_prices_season_player_base_uniq
  ON fantasy_player_prices (season_id, player_id) WHERE effective_round_id IS NULL;

ALTER TABLE fantasy_chips DROP CONSTRAINT IF EXISTS fantasy_chips_manager_id_chip_type_key;
CREATE UNIQUE INDEX IF NOT EXISTS fantasy_chips_manager_season_chip_uniq ON fantasy_chips (manager_id, season_id, chip_type);

ALTER TABLE fantasy_leagues DROP CONSTRAINT IF EXISTS fantasy_leagues_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS fantasy_leagues_season_code_uniq ON fantasy_leagues (season_id, code);

ALTER TABLE fantasy_manager_round_scores DROP CONSTRAINT IF EXISTS fantasy_manager_round_scores_manager_id_round_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS fantasy_manager_round_scores_manager_season_round_uniq
  ON fantasy_manager_round_scores (manager_id, season_id, round_id);

ALTER TABLE fantasy_squads DROP CONSTRAINT IF EXISTS fantasy_squads_manager_id_round_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS fantasy_squads_manager_season_round_uniq
  ON fantasy_squads (manager_id, season_id, round_id) WHERE round_id IS NOT NULL;
DROP INDEX IF EXISTS fantasy_squads_manager_null_round_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS fantasy_squads_manager_season_null_round_uniq
  ON fantasy_squads (manager_id, season_id) WHERE round_id IS NULL;

ALTER TABLE fantasy_squads ADD COLUMN IF NOT EXISTS carried_from_squad_id UUID REFERENCES fantasy_squads(id) ON DELETE SET NULL;

ALTER TABLE fantasy_import_batches
  ADD COLUMN IF NOT EXISTS summary JSONB,
  ADD COLUMN IF NOT EXISTS source_hash TEXT;

-- Cross-season integrity: a row's round must belong to the row's season.
-- Fires only when season_id/round_id are being set or changed, so untouched
-- legacy rows are never rejected.
CREATE OR REPLACE FUNCTION fantasy_check_round_season()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  round_season UUID;
  row_round UUID;
BEGIN
  row_round := NEW.round_id;
  IF row_round IS NULL OR NEW.season_id IS NULL THEN RETURN NEW; END IF;
  SELECT season_id INTO round_season FROM fantasy_rounds WHERE id = row_round;
  IF round_season IS NOT NULL AND round_season <> NEW.season_id THEN
    RAISE EXCEPTION 'round % belongs to a different fantasy season', row_round;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['fantasy_squads','fantasy_transfers','fantasy_chips','fantasy_manager_round_scores'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_round_season ON %I', tbl, tbl);
    EXECUTE format('CREATE TRIGGER trg_%s_round_season BEFORE INSERT OR UPDATE OF season_id, round_id ON %I FOR EACH ROW EXECUTE FUNCTION fantasy_check_round_season()', tbl, tbl);
  END LOOP;
  EXECUTE 'DROP TRIGGER IF EXISTS trg_fantasy_match_stats_round_season ON fantasy_match_stats';
  EXECUTE 'CREATE TRIGGER trg_fantasy_match_stats_round_season BEFORE INSERT OR UPDATE OF season_id, round_id ON fantasy_match_stats FOR EACH ROW EXECUTE FUNCTION fantasy_check_round_season()';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. PlayHQ grade sources + resumable sync jobs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fantasy_season_grade_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES fantasy_seasons(id) ON DELETE CASCADE,
  playhq_grade_id TEXT NOT NULL,
  grade_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  team_filter TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (season_id, playhq_grade_id)
);

DROP TRIGGER IF EXISTS trg_fantasy_season_grade_sources_updated_at ON fantasy_season_grade_sources;
CREATE TRIGGER trg_fantasy_season_grade_sources_updated_at
BEFORE UPDATE ON fantasy_season_grade_sources
FOR EACH ROW EXECUTE FUNCTION set_fantasy_updated_at();

CREATE TABLE IF NOT EXISTS fantasy_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES fantasy_seasons(id) ON DELETE CASCADE,
  import_batch_id UUID REFERENCES fantasy_import_batches(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','paused','needs_review','completed','failed','cancelled')),
  total_games INTEGER NOT NULL DEFAULT 0,
  processed_games INTEGER NOT NULL DEFAULT 0,
  successful_games INTEGER NOT NULL DEFAULT 0,
  failed_games INTEGER NOT NULL DEFAULT 0,
  cursor JSONB,
  game_queue JSONB,
  counts JSONB,
  error_summary JSONB,
  review_items JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_fantasy_sync_jobs_updated_at ON fantasy_sync_jobs;
CREATE TRIGGER trg_fantasy_sync_jobs_updated_at
BEFORE UPDATE ON fantasy_sync_jobs
FOR EACH ROW EXECUTE FUNCTION set_fantasy_updated_at();

CREATE INDEX IF NOT EXISTS fantasy_sync_jobs_season_status_idx ON fantasy_sync_jobs (season_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 6. Indexes for season filters and fantasy foreign keys
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS fantasy_rounds_season_idx ON fantasy_rounds (season_id);
CREATE INDEX IF NOT EXISTS fantasy_player_prices_season_idx ON fantasy_player_prices (season_id);
CREATE INDEX IF NOT EXISTS fantasy_player_prices_player_idx ON fantasy_player_prices (player_id);
CREATE INDEX IF NOT EXISTS fantasy_player_prices_effective_round_idx ON fantasy_player_prices (effective_round_id);
CREATE INDEX IF NOT EXISTS fantasy_import_batches_season_status_idx ON fantasy_import_batches (season_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS fantasy_match_stats_season_idx ON fantasy_match_stats (season_id);
CREATE INDEX IF NOT EXISTS fantasy_match_stats_player_idx ON fantasy_match_stats (player_id);
CREATE INDEX IF NOT EXISTS fantasy_match_stats_round_idx ON fantasy_match_stats (round_id);
CREATE INDEX IF NOT EXISTS fantasy_match_stats_batch_idx ON fantasy_match_stats (import_batch_id);
CREATE INDEX IF NOT EXISTS fantasy_season_players_season_idx ON fantasy_season_players (season_id);
CREATE INDEX IF NOT EXISTS fantasy_season_players_player_idx ON fantasy_season_players (player_id);
CREATE INDEX IF NOT EXISTS fantasy_squads_season_idx ON fantasy_squads (season_id);
CREATE INDEX IF NOT EXISTS fantasy_squads_manager_idx ON fantasy_squads (manager_id);
CREATE INDEX IF NOT EXISTS fantasy_squads_round_idx ON fantasy_squads (round_id);
CREATE INDEX IF NOT EXISTS fantasy_squads_carried_from_idx ON fantasy_squads (carried_from_squad_id);
CREATE INDEX IF NOT EXISTS fantasy_squad_players_squad_idx ON fantasy_squad_players (squad_id);
CREATE INDEX IF NOT EXISTS fantasy_squad_players_player_idx ON fantasy_squad_players (player_id);
CREATE INDEX IF NOT EXISTS fantasy_transfers_season_idx ON fantasy_transfers (season_id);
CREATE INDEX IF NOT EXISTS fantasy_transfers_manager_idx ON fantasy_transfers (manager_id);
CREATE INDEX IF NOT EXISTS fantasy_transfers_round_idx ON fantasy_transfers (round_id);
CREATE INDEX IF NOT EXISTS fantasy_transfers_player_out_idx ON fantasy_transfers (player_out_id);
CREATE INDEX IF NOT EXISTS fantasy_transfers_player_in_idx ON fantasy_transfers (player_in_id);
CREATE INDEX IF NOT EXISTS fantasy_chips_season_idx ON fantasy_chips (season_id);
CREATE INDEX IF NOT EXISTS fantasy_chips_round_idx ON fantasy_chips (round_id);
CREATE INDEX IF NOT EXISTS fantasy_leagues_season_idx ON fantasy_leagues (season_id);
CREATE INDEX IF NOT EXISTS fantasy_leagues_created_by_idx ON fantasy_leagues (created_by_manager_id);
CREATE INDEX IF NOT EXISTS fantasy_league_members_league_idx ON fantasy_league_members (league_id);
CREATE INDEX IF NOT EXISTS fantasy_league_members_manager_idx ON fantasy_league_members (manager_id);
CREATE INDEX IF NOT EXISTS fantasy_manager_round_scores_season_idx ON fantasy_manager_round_scores (season_id);
CREATE INDEX IF NOT EXISTS fantasy_manager_round_scores_round_idx ON fantasy_manager_round_scores (round_id);
CREATE INDEX IF NOT EXISTS fantasy_manager_round_scores_squad_idx ON fantasy_manager_round_scores (squad_id);
CREATE INDEX IF NOT EXISTS fantasy_settings_season_idx ON fantasy_settings (season_id);

-- ---------------------------------------------------------------------------
-- 7. Committee role: fantasy_manager (restricted CMS role)
-- ---------------------------------------------------------------------------
ALTER TABLE committee_users DROP CONSTRAINT IF EXISTS committee_users_role_check;
ALTER TABLE committee_users ADD CONSTRAINT committee_users_role_check
  CHECK (role IN ('admin','president','secretary','committee','fantasy_manager'));

-- ---------------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE fantasy_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_season_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_season_grade_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_sync_jobs ENABLE ROW LEVEL SECURITY;

-- Public (anon + authenticated) may read public seasons and their published,
-- selectable data. All mutations happen through server routes using the
-- service role, so no client write policies exist on these tables.
DROP POLICY IF EXISTS fantasy_seasons_public_read ON fantasy_seasons;
CREATE POLICY fantasy_seasons_public_read ON fantasy_seasons
FOR SELECT TO anon, authenticated USING (is_public);

DROP POLICY IF EXISTS fantasy_season_players_public_read ON fantasy_season_players;
CREATE POLICY fantasy_season_players_public_read ON fantasy_season_players
FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM fantasy_seasons s WHERE s.id = season_id AND s.is_public));

DROP POLICY IF EXISTS fantasy_players_public_read ON fantasy_players;
CREATE POLICY fantasy_players_public_read ON fantasy_players
FOR SELECT TO anon, authenticated USING (active);

DROP POLICY IF EXISTS fantasy_rounds_public_read ON fantasy_rounds;
CREATE POLICY fantasy_rounds_public_read ON fantasy_rounds
FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM fantasy_seasons s WHERE s.id = season_id AND s.is_public));

DROP POLICY IF EXISTS fantasy_player_prices_public_read ON fantasy_player_prices;
CREATE POLICY fantasy_player_prices_public_read ON fantasy_player_prices
FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM fantasy_seasons s WHERE s.id = season_id AND s.is_public));

DROP POLICY IF EXISTS fantasy_scoring_rules_public_read ON fantasy_scoring_rules;
CREATE POLICY fantasy_scoring_rules_public_read ON fantasy_scoring_rules
FOR SELECT TO anon, authenticated USING (enabled);

-- Published stats in public seasons only (leaderboard display fields).
DROP POLICY IF EXISTS fantasy_match_stats_published_read ON fantasy_match_stats;
CREATE POLICY fantasy_match_stats_published_read ON fantasy_match_stats
FOR SELECT TO anon, authenticated
USING (
  EXISTS (SELECT 1 FROM fantasy_seasons s WHERE s.id = season_id AND s.is_public)
  AND EXISTS (SELECT 1 FROM fantasy_import_batches b WHERE b.id = import_batch_id AND b.status = 'published')
);

-- Admin/import tables stay server-only: explicit deny policies document the
-- intent (and clear the "RLS enabled, no policy" advisor finding) while the
-- service role bypasses RLS for server routes.
DROP POLICY IF EXISTS fantasy_import_batches_no_client_access ON fantasy_import_batches;
CREATE POLICY fantasy_import_batches_no_client_access ON fantasy_import_batches
FOR SELECT TO anon, authenticated USING (FALSE);

DROP POLICY IF EXISTS fantasy_season_grade_sources_no_client_access ON fantasy_season_grade_sources;
CREATE POLICY fantasy_season_grade_sources_no_client_access ON fantasy_season_grade_sources
FOR SELECT TO anon, authenticated USING (FALSE);

DROP POLICY IF EXISTS fantasy_sync_jobs_no_client_access ON fantasy_sync_jobs;
CREATE POLICY fantasy_sync_jobs_no_client_access ON fantasy_sync_jobs
FOR SELECT TO anon, authenticated USING (FALSE);

-- Fixed, safe search_path for the shared fantasy updated_at trigger function.
ALTER FUNCTION set_fantasy_updated_at() SET search_path = public;
