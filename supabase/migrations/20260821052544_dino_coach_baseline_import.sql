-- Audited fallback for committee-supplied prior-season evidence. This does
-- not claim that the PlayHQ API returned data: the source type, file hash,
-- row reference and identity decision remain visible for every player.

CREATE TABLE IF NOT EXISTS fantasy_baseline_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_season_id UUID NOT NULL REFERENCES fantasy_seasons(id) ON DELETE RESTRICT,
  source_season_label TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'committee_playhq_export'
    CHECK (source_type IN ('committee_playhq_export','committee_manual_baseline')),
  filename TEXT,
  source_url TEXT,
  source_file_sha256 TEXT NOT NULL CHECK (source_file_sha256 ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','applied','rejected')),
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  created_by TEXT NOT NULL,
  applied_by TEXT,
  applied_at TIMESTAMPTZ,
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fantasy_baseline_import_batches_season_idx
  ON fantasy_baseline_import_batches(target_season_id, created_at DESC);
ALTER TABLE fantasy_baseline_import_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fantasy_baseline_import_batches FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS fantasy_baseline_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES fantasy_baseline_import_batches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES fantasy_players(id) ON DELETE RESTRICT,
  submitted_player_name TEXT NOT NULL,
  playhq_player_id TEXT,
  source_status TEXT NOT NULL CHECK (source_status IN (
    'verified_playhq','verified_no_prior_appearance','international_manual','international_premium'
  )),
  appearances INTEGER NOT NULL CHECK (appearances >= 0),
  role_neutral_points NUMERIC(14,4) NOT NULL CHECK (role_neutral_points >= 0),
  prior_average_points NUMERIC(12,4) NOT NULL CHECK (prior_average_points >= 0),
  source_reference TEXT NOT NULL CHECK (length(trim(source_reference)) > 0),
  identity_decision TEXT NOT NULL CHECK (identity_decision IN ('stable_id','unique_normalised_name')),
  calculation JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(batch_id, player_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS fantasy_baseline_import_rows_source_uniq
  ON fantasy_baseline_import_rows(batch_id, playhq_player_id) WHERE playhq_player_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fantasy_baseline_import_rows_player_idx
  ON fantasy_baseline_import_rows(player_id, batch_id);
ALTER TABLE fantasy_baseline_import_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fantasy_baseline_import_rows FROM anon, authenticated;

CREATE OR REPLACE FUNCTION publish_dino_coach_baseline_import(target_batch_id UUID, actor TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_batch public.fantasy_baseline_import_batches%ROWTYPE;
  cfg public.fantasy_dino_settings%ROWTYPE;
  roster_count INTEGER;
  imported_rows INTEGER;
  invalid_count INTEGER;
  best_domestic NUMERIC(12,4);
  top_15_cost BIGINT;
  cheapest_15_cost BIGINT;
BEGIN
  IF actor IS NULL OR length(trim(actor)) = 0 THEN
    RAISE EXCEPTION 'An authenticated reviewer is required.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO target_batch
  FROM public.fantasy_baseline_import_batches
  WHERE id = target_batch_id
  FOR UPDATE;
  IF NOT FOUND OR target_batch.status <> 'draft' THEN
    RAISE EXCEPTION 'Baseline import is not an unapplied draft.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO cfg FROM public.fantasy_dino_settings
  WHERE season_id = target_batch.target_season_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dino Coach settings are missing for the target season.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*) INTO roster_count
  FROM public.fantasy_season_players
  WHERE season_id = target_batch.target_season_id AND active AND selectable;
  SELECT COUNT(*) INTO imported_rows
  FROM public.fantasy_baseline_import_rows WHERE batch_id = target_batch_id;
  IF roster_count = 0 OR imported_rows <> roster_count THEN
    RAISE EXCEPTION 'Baseline import must cover every selectable player exactly once (% of %).', imported_rows, roster_count
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*) INTO invalid_count
  FROM public.fantasy_baseline_import_rows r
  LEFT JOIN public.fantasy_season_players sp
    ON sp.season_id = target_batch.target_season_id AND sp.player_id = r.player_id
      AND sp.active AND sp.selectable
  LEFT JOIN public.fantasy_players p ON p.id = r.player_id
  WHERE r.batch_id = target_batch_id AND (
    sp.player_id IS NULL OR p.id IS NULL
    OR (r.source_status = 'verified_playhq' AND
      (r.playhq_player_id IS NULL OR r.appearances < 1 OR p.is_international))
    OR (r.source_status = 'verified_no_prior_appearance' AND
      (r.appearances <> 0 OR r.role_neutral_points <> 0 OR p.is_international))
    OR (r.source_status = 'international_manual' AND
      (r.appearances < 1 OR NOT p.is_international))
    OR (r.source_status = 'international_premium' AND
      (r.appearances <> 0 OR r.role_neutral_points <> 0 OR NOT p.is_international))
    OR (r.appearances > 0 AND r.prior_average_points <> ROUND(r.role_neutral_points / r.appearances, 4))
    OR (r.appearances = 0 AND r.prior_average_points <> 0)
  );
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Baseline import contains % invalid source or calculation row(s).', invalid_count
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*) INTO invalid_count
  FROM public.fantasy_baseline_import_rows r
  JOIN public.fantasy_players p ON p.id = r.player_id
  WHERE r.batch_id = target_batch_id AND r.playhq_player_id IS NOT NULL
    AND p.playhq_player_id IS NOT NULL AND p.playhq_player_id <> r.playhq_player_id;
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Baseline import conflicts with % existing stable PlayHQ link(s).', invalid_count
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT MAX(r.prior_average_points) INTO best_domestic
  FROM public.fantasy_baseline_import_rows r
  JOIN public.fantasy_players p ON p.id = r.player_id
  WHERE r.batch_id = target_batch_id AND NOT p.is_international
    AND r.source_status = 'verified_playhq' AND r.appearances > 0;
  IF COALESCE(best_domestic, 0) <= 0 THEN
    RAISE EXCEPTION 'A positive verified domestic baseline is required.' USING ERRCODE = 'check_violation';
  END IF;

  WITH calculated AS (
    SELECT ROUND(cfg.initial_price_floor_dino_dollars +
      LEAST(1, GREATEST(0, CASE WHEN r.source_status = 'international_premium'
        THEN best_domestic ELSE r.prior_average_points END / best_domestic)) *
      (cfg.initial_price_ceiling_dino_dollars - cfg.initial_price_floor_dino_dollars))::BIGINT AS price
    FROM public.fantasy_baseline_import_rows r WHERE r.batch_id = target_batch_id
  )
  SELECT COALESCE(SUM(price), 0) INTO top_15_cost
  FROM (SELECT price FROM calculated ORDER BY price DESC LIMIT 15) highest;

  WITH calculated AS (
    SELECT ROUND(cfg.initial_price_floor_dino_dollars +
      LEAST(1, GREATEST(0, CASE WHEN r.source_status = 'international_premium'
        THEN best_domestic ELSE r.prior_average_points END / best_domestic)) *
      (cfg.initial_price_ceiling_dino_dollars - cfg.initial_price_floor_dino_dollars))::BIGINT AS price
    FROM public.fantasy_baseline_import_rows r WHERE r.batch_id = target_batch_id
  )
  SELECT COALESCE(SUM(price), 0) INTO cheapest_15_cost
  FROM (SELECT price FROM calculated ORDER BY price ASC LIMIT 15) lowest;

  -- Economy hard gates: the top 15 must exceed budget and the cheapest 15
  -- must be affordable before any player outcome or price is changed.
  IF top_15_cost <= cfg.budget_dino_dollars THEN
    RAISE EXCEPTION 'Economy calibration failed: top 15 cost % does not exceed budget %.', top_15_cost, cfg.budget_dino_dollars
      USING ERRCODE = 'check_violation';
  END IF;
  IF cheapest_15_cost > cfg.budget_dino_dollars THEN
    RAISE EXCEPTION 'Economy calibration failed: cheapest 15 cost % exceeds budget %.', cheapest_15_cost, cfg.budget_dino_dollars
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.fantasy_players p
  SET playhq_player_id = r.playhq_player_id, updated_at = NOW()
  FROM public.fantasy_baseline_import_rows r
  WHERE r.batch_id = target_batch_id AND r.player_id = p.id
    AND r.playhq_player_id IS NOT NULL AND p.playhq_player_id IS NULL;

  INSERT INTO public.fantasy_player_identity_audit(
    season_id, player_id, playhq_player_id, playhq_display_name, local_display_name,
    decision, detail
  )
  SELECT target_batch.target_season_id, r.player_id, r.playhq_player_id,
    r.submitted_player_name, p.display_name,
    CASE WHEN r.identity_decision = 'stable_id' THEN 'stable_id' ELSE 'unique_normalised_name' END,
    'Applied from audited baseline import ' || target_batch_id::TEXT || ': ' || r.source_reference
  FROM public.fantasy_baseline_import_rows r
  JOIN public.fantasy_players p ON p.id = r.player_id
  WHERE r.batch_id = target_batch_id
  ON CONFLICT DO NOTHING;

  UPDATE public.fantasy_season_players sp
  SET stats_status = r.source_status,
      prior_regular_appearances = r.appearances,
      prior_average_points = CASE WHEN r.source_status = 'international_premium' THEN best_domestic ELSE r.prior_average_points END,
      international_baseline_points = CASE WHEN r.source_status IN ('international_manual','international_premium')
        THEN CASE WHEN r.source_status = 'international_premium' THEN best_domestic ELSE r.prior_average_points END ELSE NULL END,
      playhq_player_id = COALESCE(r.playhq_player_id, sp.playhq_player_id),
      updated_at = NOW()
  FROM public.fantasy_baseline_import_rows r
  WHERE r.batch_id = target_batch_id AND sp.season_id = target_batch.target_season_id
    AND sp.player_id = r.player_id;

  WITH calculated AS (
    SELECT r.player_id, r.source_status, r.appearances, r.role_neutral_points, r.source_reference,
      CASE WHEN r.source_status = 'international_premium' THEN best_domestic ELSE r.prior_average_points END AS baseline,
      ROUND(cfg.initial_price_floor_dino_dollars +
        LEAST(1, GREATEST(0, CASE WHEN r.source_status = 'international_premium'
          THEN best_domestic ELSE r.prior_average_points END / best_domestic)) *
        (cfg.initial_price_ceiling_dino_dollars - cfg.initial_price_floor_dino_dollars))::BIGINT AS price
    FROM public.fantasy_baseline_import_rows r WHERE r.batch_id = target_batch_id
  )
  UPDATE public.fantasy_player_prices p
  SET price_dino_dollars = c.price, price_million = c.price / 1000000.0,
      formula_version = 'dino-baseline-import-v1', prior_baseline_points = c.baseline,
      previous_rolling_performance_points = c.baseline, rolling_performance_points = c.baseline,
      price_change_dino_dollars = 0, source_status = c.source_status,
      calculation = jsonb_build_object('baseline_import_id', target_batch_id, 'appearances', c.appearances,
        'role_neutral_points', c.role_neutral_points, 'best_domestic_average', best_domestic,
        'source_status', c.source_status, 'source_reference', c.source_reference,
        'international_premium_fallback', c.source_status = 'international_premium'),
      published_at = NULL
  FROM calculated c
  WHERE p.season_id = target_batch.target_season_id AND p.player_id = c.player_id
    AND p.effective_round_id IS NULL;

  WITH calculated AS (
    SELECT r.player_id, r.source_status, r.appearances, r.role_neutral_points, r.source_reference,
      CASE WHEN r.source_status = 'international_premium' THEN best_domestic ELSE r.prior_average_points END AS baseline,
      ROUND(cfg.initial_price_floor_dino_dollars +
        LEAST(1, GREATEST(0, CASE WHEN r.source_status = 'international_premium'
          THEN best_domestic ELSE r.prior_average_points END / best_domestic)) *
        (cfg.initial_price_ceiling_dino_dollars - cfg.initial_price_floor_dino_dollars))::BIGINT AS price
    FROM public.fantasy_baseline_import_rows r WHERE r.batch_id = target_batch_id
  )
  INSERT INTO public.fantasy_player_prices(
    season_id, player_id, price_million, effective_round_id, price_dino_dollars,
    formula_version, prior_baseline_points, previous_rolling_performance_points,
    rolling_performance_points, price_change_dino_dollars, source_status, calculation, published_at
  )
  SELECT target_batch.target_season_id, c.player_id, c.price / 1000000.0, NULL, c.price,
    'dino-baseline-import-v1', c.baseline, c.baseline, c.baseline, 0, c.source_status,
    jsonb_build_object('baseline_import_id', target_batch_id, 'appearances', c.appearances,
      'role_neutral_points', c.role_neutral_points, 'best_domestic_average', best_domestic,
      'source_status', c.source_status, 'source_reference', c.source_reference,
      'international_premium_fallback', c.source_status = 'international_premium'), NULL
  FROM calculated c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.fantasy_player_prices p
    WHERE p.season_id = target_batch.target_season_id AND p.player_id = c.player_id
      AND p.effective_round_id IS NULL
  );

  WITH calculated AS (
    SELECT r.player_id, r.source_status, r.appearances, r.role_neutral_points, r.source_reference,
      CASE WHEN r.source_status = 'international_premium' THEN best_domestic ELSE r.prior_average_points END AS baseline,
      ROUND(cfg.initial_price_floor_dino_dollars +
        LEAST(1, GREATEST(0, CASE WHEN r.source_status = 'international_premium'
          THEN best_domestic ELSE r.prior_average_points END / best_domestic)) *
        (cfg.initial_price_ceiling_dino_dollars - cfg.initial_price_floor_dino_dollars))::BIGINT AS price
    FROM public.fantasy_baseline_import_rows r WHERE r.batch_id = target_batch_id
  )
  INSERT INTO public.fantasy_price_calculations(
    season_id, player_id, effective_round_id, formula_version, prior_baseline_points,
    recent_points, previous_rolling_performance_points, rolling_performance_points,
    previous_price_dino_dollars, price_change_dino_dollars, new_price_dino_dollars,
    source_status, evidence, published_at
  )
  SELECT target_batch.target_season_id, c.player_id, NULL, 'dino-baseline-import-v1', c.baseline,
    ARRAY[]::NUMERIC[], c.baseline, c.baseline, c.price, 0, c.price, c.source_status,
    jsonb_build_object('baseline_import_id', target_batch_id, 'appearances', c.appearances,
      'role_neutral_points', c.role_neutral_points, 'best_domestic_average', best_domestic,
      'source_status', c.source_status, 'source_reference', c.source_reference,
      'international_premium_fallback', c.source_status = 'international_premium'), NULL
  FROM calculated c
  ON CONFLICT (season_id, player_id, effective_round_id, formula_version) DO UPDATE SET
    prior_baseline_points = EXCLUDED.prior_baseline_points,
    recent_points = EXCLUDED.recent_points,
    previous_rolling_performance_points = EXCLUDED.previous_rolling_performance_points,
    rolling_performance_points = EXCLUDED.rolling_performance_points,
    previous_price_dino_dollars = EXCLUDED.previous_price_dino_dollars,
    price_change_dino_dollars = EXCLUDED.price_change_dino_dollars,
    new_price_dino_dollars = EXCLUDED.new_price_dino_dollars,
    source_status = EXCLUDED.source_status, evidence = EXCLUDED.evidence, published_at = NULL;

  UPDATE public.fantasy_baseline_import_batches
  SET status = 'applied', row_count = imported_rows, applied_by = actor, applied_at = NOW(), updated_at = NOW(),
      evidence = evidence || jsonb_build_object('best_domestic_average', best_domestic,
        'top_15_cost', top_15_cost, 'cheapest_15_cost', cheapest_15_cost,
        'budget_dino_dollars', cfg.budget_dino_dollars)
  WHERE id = target_batch_id;

  RETURN jsonb_build_object('batch_id', target_batch_id, 'players', imported_rows,
    'best_domestic_average', best_domestic, 'top_15_cost', top_15_cost,
    'cheapest_15_cost', cheapest_15_cost, 'budget_dino_dollars', cfg.budget_dino_dollars,
    'prices_published', false);
END;
$$;

REVOKE ALL ON FUNCTION publish_dino_coach_baseline_import(UUID,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION publish_dino_coach_baseline_import(UUID,TEXT) TO service_role;
