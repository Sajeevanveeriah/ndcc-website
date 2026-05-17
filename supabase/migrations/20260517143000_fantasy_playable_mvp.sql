CREATE TABLE IF NOT EXISTS fantasy_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_name TEXT NOT NULL DEFAULT 'NDCC Fantasy Cricket',
  squad_budget NUMERIC(6,1) NOT NULL DEFAULT 100.0,
  max_players_per_role JSONB NOT NULL DEFAULT '{"WK":2,"BAT":5,"AR":3,"BOWL":5}'::jsonb,
  starting_players_required INTEGER NOT NULL DEFAULT 11,
  bench_players_required INTEGER NOT NULL DEFAULT 4,
  free_transfers_per_round INTEGER NOT NULL DEFAULT 1,
  transfer_penalty_points INTEGER NOT NULL DEFAULT 4,
  is_registration_open BOOLEAN NOT NULL DEFAULT TRUE,
  is_team_selection_open BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fantasy_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  team_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fantasy_squads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id UUID REFERENCES fantasy_managers(id) ON DELETE CASCADE,
  round_id UUID REFERENCES fantasy_rounds(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','locked')),
  budget_used NUMERIC(6,1) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(manager_id, round_id)
);

CREATE TABLE IF NOT EXISTS fantasy_squad_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id UUID REFERENCES fantasy_squads(id) ON DELETE CASCADE,
  player_id UUID REFERENCES fantasy_players(id) ON DELETE CASCADE,
  position_type TEXT NOT NULL CHECK (position_type IN ('starter','bench')),
  bench_order INTEGER,
  is_captain BOOLEAN NOT NULL DEFAULT FALSE,
  is_vice_captain BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(squad_id, player_id)
);

CREATE TABLE IF NOT EXISTS fantasy_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id UUID REFERENCES fantasy_managers(id) ON DELETE CASCADE,
  round_id UUID REFERENCES fantasy_rounds(id) ON DELETE SET NULL,
  player_out_id UUID REFERENCES fantasy_players(id) ON DELETE SET NULL,
  player_in_id UUID REFERENCES fantasy_players(id) ON DELETE SET NULL,
  penalty_points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fantasy_chips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id UUID REFERENCES fantasy_managers(id) ON DELETE CASCADE,
  round_id UUID REFERENCES fantasy_rounds(id) ON DELETE SET NULL,
  chip_type TEXT NOT NULL CHECK (chip_type IN ('wildcard','free_hit','bench_boost','triple_captain')),
  used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(manager_id, chip_type)
);

CREATE TABLE IF NOT EXISTS fantasy_leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_by_manager_id UUID REFERENCES fantasy_managers(id) ON DELETE SET NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fantasy_league_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES fantasy_leagues(id) ON DELETE CASCADE,
  manager_id UUID REFERENCES fantasy_managers(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, manager_id)
);

CREATE TABLE IF NOT EXISTS fantasy_manager_round_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id UUID REFERENCES fantasy_managers(id) ON DELETE CASCADE,
  round_id UUID REFERENCES fantasy_rounds(id) ON DELETE CASCADE,
  squad_id UUID REFERENCES fantasy_squads(id) ON DELETE SET NULL,
  total_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  transfer_penalty INTEGER NOT NULL DEFAULT 0,
  net_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(manager_id, round_id)
);

DROP TRIGGER IF EXISTS trg_fantasy_settings_updated_at ON fantasy_settings;
CREATE TRIGGER trg_fantasy_settings_updated_at
BEFORE UPDATE ON fantasy_settings
FOR EACH ROW
EXECUTE FUNCTION set_fantasy_updated_at();

DROP TRIGGER IF EXISTS trg_fantasy_managers_updated_at ON fantasy_managers;
CREATE TRIGGER trg_fantasy_managers_updated_at
BEFORE UPDATE ON fantasy_managers
FOR EACH ROW
EXECUTE FUNCTION set_fantasy_updated_at();

DROP TRIGGER IF EXISTS trg_fantasy_squads_updated_at ON fantasy_squads;
CREATE TRIGGER trg_fantasy_squads_updated_at
BEFORE UPDATE ON fantasy_squads
FOR EACH ROW
EXECUTE FUNCTION set_fantasy_updated_at();

INSERT INTO fantasy_settings (season_name)
SELECT 'NDCC Fantasy Cricket'
WHERE NOT EXISTS (SELECT 1 FROM fantasy_settings);

ALTER TABLE fantasy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_squad_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_chips ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_league_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_manager_round_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fantasy_settings_authenticated_read ON fantasy_settings;
CREATE POLICY fantasy_settings_authenticated_read ON fantasy_settings
FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS fantasy_managers_owner_read ON fantasy_managers;
CREATE POLICY fantasy_managers_owner_read ON fantasy_managers
FOR SELECT TO authenticated USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS fantasy_managers_owner_insert ON fantasy_managers;
CREATE POLICY fantasy_managers_owner_insert ON fantasy_managers
FOR INSERT TO authenticated WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS fantasy_managers_owner_update ON fantasy_managers;
CREATE POLICY fantasy_managers_owner_update ON fantasy_managers
FOR UPDATE TO authenticated USING (auth_user_id = auth.uid()) WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS fantasy_squads_owner_all ON fantasy_squads;
CREATE POLICY fantasy_squads_owner_all ON fantasy_squads
FOR ALL TO authenticated
USING (manager_id IN (SELECT id FROM fantasy_managers WHERE auth_user_id = auth.uid()))
WITH CHECK (manager_id IN (SELECT id FROM fantasy_managers WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS fantasy_squad_players_owner_all ON fantasy_squad_players;
CREATE POLICY fantasy_squad_players_owner_all ON fantasy_squad_players
FOR ALL TO authenticated
USING (squad_id IN (SELECT s.id FROM fantasy_squads s JOIN fantasy_managers m ON m.id = s.manager_id WHERE m.auth_user_id = auth.uid()))
WITH CHECK (squad_id IN (SELECT s.id FROM fantasy_squads s JOIN fantasy_managers m ON m.id = s.manager_id WHERE m.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS fantasy_transfers_owner_read ON fantasy_transfers;
CREATE POLICY fantasy_transfers_owner_read ON fantasy_transfers
FOR SELECT TO authenticated USING (manager_id IN (SELECT id FROM fantasy_managers WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS fantasy_transfers_owner_insert ON fantasy_transfers;
CREATE POLICY fantasy_transfers_owner_insert ON fantasy_transfers
FOR INSERT TO authenticated WITH CHECK (manager_id IN (SELECT id FROM fantasy_managers WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS fantasy_chips_owner_all ON fantasy_chips;
CREATE POLICY fantasy_chips_owner_all ON fantasy_chips
FOR ALL TO authenticated
USING (manager_id IN (SELECT id FROM fantasy_managers WHERE auth_user_id = auth.uid()))
WITH CHECK (manager_id IN (SELECT id FROM fantasy_managers WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS fantasy_leagues_member_read ON fantasy_leagues;
CREATE POLICY fantasy_leagues_member_read ON fantasy_leagues
FOR SELECT TO authenticated
USING (is_public OR created_by_manager_id IN (SELECT id FROM fantasy_managers WHERE auth_user_id = auth.uid()) OR id IN (SELECT lm.league_id FROM fantasy_league_members lm JOIN fantasy_managers m ON m.id = lm.manager_id WHERE m.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS fantasy_leagues_owner_insert ON fantasy_leagues;
CREATE POLICY fantasy_leagues_owner_insert ON fantasy_leagues
FOR INSERT TO authenticated WITH CHECK (created_by_manager_id IN (SELECT id FROM fantasy_managers WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS fantasy_league_members_owner_read ON fantasy_league_members;
CREATE POLICY fantasy_league_members_owner_read ON fantasy_league_members
FOR SELECT TO authenticated USING (manager_id IN (SELECT id FROM fantasy_managers WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS fantasy_league_members_owner_insert ON fantasy_league_members;
CREATE POLICY fantasy_league_members_owner_insert ON fantasy_league_members
FOR INSERT TO authenticated WITH CHECK (manager_id IN (SELECT id FROM fantasy_managers WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS fantasy_scores_owner_read ON fantasy_manager_round_scores;
CREATE POLICY fantasy_scores_owner_read ON fantasy_manager_round_scores
FOR SELECT TO authenticated USING (manager_id IN (SELECT id FROM fantasy_managers WHERE auth_user_id = auth.uid()));
