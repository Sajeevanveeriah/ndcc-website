ALTER TABLE fantasy_squads ADD COLUMN IF NOT EXISTS budget_used_dino_dollars BIGINT NOT NULL DEFAULT 0;
ALTER TABLE fantasy_squad_players ADD COLUMN IF NOT EXISTS slot_key TEXT, ADD COLUMN IF NOT EXISTS assigned_role TEXT, ADD COLUMN IF NOT EXISTS purchase_price_dino_dollars BIGINT NOT NULL DEFAULT 0;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fantasy_squad_players_assigned_role_check') THEN ALTER TABLE fantasy_squad_players ADD CONSTRAINT fantasy_squad_players_assigned_role_check CHECK (assigned_role IS NULL OR assigned_role IN ('WK','BAT','AR','BOWL')); END IF; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS fantasy_squad_players_squad_slot_uniq ON fantasy_squad_players(squad_id,slot_key) WHERE slot_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fantasy_squads_manager_season_round_uniq ON fantasy_squads(manager_id,season_id,round_id) NULLS NOT DISTINCT;
ALTER TABLE fantasy_player_prices
  ADD COLUMN IF NOT EXISTS price_dino_dollars BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS formula_version TEXT NOT NULL DEFAULT 'pending-playhq',
  ADD COLUMN IF NOT EXISTS prior_baseline_points NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS rolling_performance_points NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS previous_rolling_performance_points NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS price_change_dino_dollars BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_status TEXT NOT NULL DEFAULT 'pending_playhq',
  ADD COLUMN IF NOT EXISTS calculation JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE fantasy_players ADD COLUMN IF NOT EXISTS is_international BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fantasy_season_players ADD COLUMN IF NOT EXISTS prior_regular_appearances INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS prior_average_points NUMERIC(12,4), ADD COLUMN IF NOT EXISTS international_baseline_points NUMERIC(12,4), ADD COLUMN IF NOT EXISTS stats_status TEXT NOT NULL DEFAULT 'pending_playhq';
ALTER TABLE fantasy_rounds ADD COLUMN IF NOT EXISTS round_kind TEXT NOT NULL DEFAULT 'regular', ADD COLUMN IF NOT EXISTS pricing_eligible BOOLEAN NOT NULL DEFAULT TRUE;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fantasy_rounds_round_kind_check') THEN ALTER TABLE fantasy_rounds ADD CONSTRAINT fantasy_rounds_round_kind_check CHECK (round_kind IN ('regular','preliminary_final','quarter_final','semi_final','grand_final','other_final')); END IF; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS fantasy_player_prices_season_player_round_uniq ON fantasy_player_prices(season_id,player_id,effective_round_id) NULLS NOT DISTINCT;
