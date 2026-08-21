CREATE TABLE IF NOT EXISTS fantasy_playhq_round_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), season_id UUID NOT NULL REFERENCES fantasy_seasons(id) ON DELETE CASCADE,
  playhq_grade_id TEXT NOT NULL, playhq_round_number INTEGER NOT NULL CHECK (playhq_round_number>0), playhq_round_name TEXT NOT NULL,
  match_date DATE, fantasy_round_id UUID REFERENCES fantasy_rounds(id) ON DELETE SET NULL,
  round_kind TEXT NOT NULL DEFAULT 'regular' CHECK (round_kind IN ('regular','preliminary_final','quarter_final','semi_final','grand_final','other_final')),
  pricing_eligible BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(season_id,playhq_grade_id,playhq_round_number,playhq_round_name)
);
CREATE INDEX IF NOT EXISTS fantasy_playhq_round_sources_round_idx ON fantasy_playhq_round_sources(fantasy_round_id);
ALTER TABLE fantasy_playhq_round_sources ENABLE ROW LEVEL SECURITY; REVOKE ALL ON fantasy_playhq_round_sources FROM anon, authenticated;
CREATE TABLE IF NOT EXISTS fantasy_player_identity_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), season_id UUID REFERENCES fantasy_seasons(id) ON DELETE CASCADE,
  player_id UUID REFERENCES fantasy_players(id) ON DELETE CASCADE, playhq_player_id TEXT, playhq_display_name TEXT NOT NULL, local_display_name TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('stable_id','unique_normalised_name','manual','review_required','unmatched')), detail TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(season_id,playhq_player_id,player_id,decision)
);
CREATE INDEX IF NOT EXISTS fantasy_player_identity_audit_review_idx ON fantasy_player_identity_audit(season_id,decision,created_at DESC);
ALTER TABLE fantasy_player_identity_audit ENABLE ROW LEVEL SECURITY; REVOKE ALL ON fantasy_player_identity_audit FROM anon, authenticated;
CREATE TABLE IF NOT EXISTS fantasy_price_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), season_id UUID NOT NULL REFERENCES fantasy_seasons(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES fantasy_players(id) ON DELETE CASCADE, effective_round_id UUID REFERENCES fantasy_rounds(id) ON DELETE SET NULL,
  formula_version TEXT NOT NULL, prior_baseline_points NUMERIC(12,4) NOT NULL, recent_points NUMERIC(12,4)[] NOT NULL DEFAULT ARRAY[]::NUMERIC[],
  previous_rolling_performance_points NUMERIC(12,4), rolling_performance_points NUMERIC(12,4) NOT NULL,
  previous_price_dino_dollars BIGINT NOT NULL, price_change_dino_dollars BIGINT NOT NULL, new_price_dino_dollars BIGINT NOT NULL,
  source_status TEXT NOT NULL, evidence JSONB NOT NULL DEFAULT '{}'::JSONB, published_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT(season_id,player_id,effective_round_id,formula_version)
);
CREATE INDEX IF NOT EXISTS fantasy_price_calculations_round_idx ON fantasy_price_calculations(season_id,effective_round_id);
ALTER TABLE fantasy_price_calculations ENABLE ROW LEVEL SECURITY; REVOKE ALL ON fantasy_price_calculations FROM anon, authenticated;
