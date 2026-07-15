-- Multi-source fantasy ingestion: NDCC participates in several PlayHQ
-- seasons per summer (Mens, Womens, T20, Juniors — all named alike). Grade
-- sources therefore record which PlayHQ season each grade belongs to, so the
-- orchestrator can ingest NDCC grades across every competition the club
-- decided counts for fantasy (owner decision 2026-07-15: all of them).
--
-- Additive and reversible. Rollback:
--   ALTER TABLE public.fantasy_season_grade_sources DROP COLUMN IF EXISTS playhq_season_id;

ALTER TABLE public.fantasy_season_grade_sources
  ADD COLUMN IF NOT EXISTS playhq_season_id TEXT;

COMMENT ON COLUMN public.fantasy_season_grade_sources.playhq_season_id IS
  'PlayHQ season the grade was discovered in. NULL = the fantasy season''s primary linked season.';
