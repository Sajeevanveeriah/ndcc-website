-- Fantasy historical reconciliation review workflow (additive + reversible).
--
-- Purpose:
--   Build a reviewable, provenance-preserving bridge between Legacy /
--   Unverified manual statistics and official PlayHQ source data without
--   mutating historical fantasy_match_stats. Exact deterministic matches can be
--   bulk-approved into a proposal, but publication/reassignment remains a
--   separate reviewed production action.
--
-- Rollback:
--   DROP TABLE IF EXISTS fantasy_historical_reconciliation_audit;
--   DROP TABLE IF EXISTS fantasy_historical_reconciliation_rows;
--   DROP TABLE IF EXISTS fantasy_historical_reconciliation_runs;
--   DROP TYPE IF EXISTS fantasy_reconciliation_review_status;
--   DROP TYPE IF EXISTS fantasy_reconciliation_classification;

CREATE TYPE fantasy_reconciliation_classification AS ENUM (
  'exact_match',
  'probable_match_requires_review',
  'ambiguous_player',
  'ambiguous_fixture',
  'conflicting_statistics',
  'no_source_data',
  'required_field_unavailable',
  'rejected'
);

CREATE TYPE fantasy_reconciliation_review_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'deferred'
);

CREATE TABLE IF NOT EXISTS fantasy_historical_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_season_id UUID REFERENCES fantasy_seasons(id) ON DELETE SET NULL,
  target_season_id UUID REFERENCES fantasy_seasons(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','reviewed','superseded')),
  source_description TEXT NOT NULL DEFAULT 'Legacy / Unverified manual statistics reconciled against PlayHQ',
  stats_row_count INTEGER NOT NULL DEFAULT 0,
  exact_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  proposed_migration_sql TEXT,
  rollback_sql TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_fantasy_historical_reconciliation_runs_updated_at ON fantasy_historical_reconciliation_runs;
CREATE TRIGGER trg_fantasy_historical_reconciliation_runs_updated_at
BEFORE UPDATE ON fantasy_historical_reconciliation_runs
FOR EACH ROW EXECUTE FUNCTION set_fantasy_updated_at();

CREATE TABLE IF NOT EXISTS fantasy_historical_reconciliation_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES fantasy_historical_reconciliation_runs(id) ON DELETE CASCADE,
  legacy_match_stat_id UUID NOT NULL REFERENCES fantasy_match_stats(id) ON DELETE CASCADE,
  player_id UUID REFERENCES fantasy_players(id) ON DELETE SET NULL,
  target_season_id UUID REFERENCES fantasy_seasons(id) ON DELETE SET NULL,
  classification fantasy_reconciliation_classification NOT NULL,
  review_status fantasy_reconciliation_review_status NOT NULL DEFAULT 'pending',
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  review_reason TEXT NOT NULL,
  source_url TEXT,
  fetched_at TIMESTAMPTZ,
  playhq_game_id TEXT,
  playhq_fixture_id TEXT,
  playhq_round_number INTEGER,
  playhq_round_name TEXT,
  opponent TEXT,
  match_date DATE,
  source_hash TEXT,
  legacy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  playhq_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  diff JSONB NOT NULL DEFAULT '{}'::jsonb,
  predicted_player_total_delta NUMERIC(10,2) NOT NULL DEFAULT 0,
  predicted_fantasy_score_delta NUMERIC(10,2) NOT NULL DEFAULT 0,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, legacy_match_stat_id)
);

DROP TRIGGER IF EXISTS trg_fantasy_historical_reconciliation_rows_updated_at ON fantasy_historical_reconciliation_rows;
CREATE TRIGGER trg_fantasy_historical_reconciliation_rows_updated_at
BEFORE UPDATE ON fantasy_historical_reconciliation_rows
FOR EACH ROW EXECUTE FUNCTION set_fantasy_updated_at();

CREATE INDEX IF NOT EXISTS fantasy_historical_reconciliation_rows_run_idx ON fantasy_historical_reconciliation_rows(run_id, classification, review_status);
CREATE INDEX IF NOT EXISTS fantasy_historical_reconciliation_rows_stat_idx ON fantasy_historical_reconciliation_rows(legacy_match_stat_id);
CREATE INDEX IF NOT EXISTS fantasy_historical_reconciliation_rows_source_idx ON fantasy_historical_reconciliation_rows(playhq_game_id, player_id) WHERE playhq_game_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fantasy_historical_reconciliation_rows_hash_idx ON fantasy_historical_reconciliation_rows(source_hash) WHERE source_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS fantasy_historical_reconciliation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES fantasy_historical_reconciliation_runs(id) ON DELETE CASCADE,
  row_id UUID REFERENCES fantasy_historical_reconciliation_rows(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('run_created','row_approved','row_rejected','row_deferred','bulk_exact_approved','proposal_generated','exported')),
  actor TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fantasy_historical_reconciliation_audit_run_idx ON fantasy_historical_reconciliation_audit(run_id, created_at DESC);

ALTER TABLE fantasy_historical_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_historical_reconciliation_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_historical_reconciliation_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fantasy_historical_reconciliation_runs_no_public ON fantasy_historical_reconciliation_runs;
DROP POLICY IF EXISTS fantasy_historical_reconciliation_rows_no_public ON fantasy_historical_reconciliation_rows;
DROP POLICY IF EXISTS fantasy_historical_reconciliation_audit_no_public ON fantasy_historical_reconciliation_audit;
CREATE POLICY fantasy_historical_reconciliation_runs_no_public ON fantasy_historical_reconciliation_runs FOR ALL USING (FALSE) WITH CHECK (FALSE);
CREATE POLICY fantasy_historical_reconciliation_rows_no_public ON fantasy_historical_reconciliation_rows FOR ALL USING (FALSE) WITH CHECK (FALSE);
CREATE POLICY fantasy_historical_reconciliation_audit_no_public ON fantasy_historical_reconciliation_audit FOR ALL USING (FALSE) WITH CHECK (FALSE);
