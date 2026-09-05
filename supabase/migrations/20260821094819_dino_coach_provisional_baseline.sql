-- Committee-authorised launch baseline used only until reviewed prior-season
-- evidence is supplied. It is deliberately labelled as non-PlayHQ history.

CREATE OR REPLACE FUNCTION public.dino_coach_release_readiness(target_season_id UUID)
RETURNS TABLE(
  ready BOOLEAN,
  selectable_players BIGINT,
  resolved_players BIGINT,
  positive_published_prices BIGINT,
  ambiguous_identities BIGINT,
  duplicate_source_links BIGINT,
  blockers TEXT[]
) LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $$
WITH roster AS (
  SELECT sp.player_id, sp.stats_status
  FROM public.fantasy_season_players sp
  WHERE sp.season_id = target_season_id AND sp.active AND sp.selectable
), prices AS (
  SELECT DISTINCT ON (p.player_id) p.player_id, p.price_dino_dollars, p.published_at
  FROM public.fantasy_player_prices p
  WHERE p.season_id = target_season_id
  ORDER BY p.player_id, p.created_at DESC
), counts AS (
  SELECT
    COUNT(*)::BIGINT AS selectable,
    COUNT(*) FILTER (WHERE r.stats_status IN (
      'verified_playhq','verified_no_prior_appearance','international_manual',
      'international_premium','provisional_baseline'
    ))::BIGINT AS resolved,
    COUNT(*) FILTER (WHERE p.price_dino_dollars > 0 AND p.published_at IS NOT NULL)::BIGINT AS published
  FROM roster r LEFT JOIN prices p ON p.player_id = r.player_id
), identity AS (
  SELECT
    COUNT(*) FILTER (WHERE decision = 'review_required')::BIGINT AS ambiguous,
    GREATEST(COUNT(*) - COUNT(DISTINCT playhq_player_id), 0)::BIGINT AS duplicates
  FROM public.fantasy_player_identity_audit
  WHERE season_id = target_season_id AND playhq_player_id IS NOT NULL
)
SELECT
  c.selectable > 0 AND c.resolved = c.selectable AND c.published = c.selectable
    AND i.ambiguous = 0 AND i.duplicates = 0,
  c.selectable, c.resolved, c.published, i.ambiguous, i.duplicates,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN c.selectable = 0 THEN 'No selectable players are configured.' END,
    CASE WHEN c.resolved <> c.selectable THEN (c.selectable-c.resolved)||' player outcomes are unresolved.' END,
    CASE WHEN c.published <> c.selectable THEN (c.selectable-c.published)||' player prices are not positive and published.' END,
    CASE WHEN i.ambiguous > 0 THEN i.ambiguous||' ambiguous identity decisions remain.' END,
    CASE WHEN i.duplicates > 0 THEN i.duplicates||' duplicate PlayHQ source links remain.' END
  ], NULL)::TEXT[]
FROM counts c CROSS JOIN identity i;
$$;

CREATE OR REPLACE FUNCTION public.apply_dino_coach_provisional_baseline(
  target_season_id UUID,
  authorised_by TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  cfg public.fantasy_dino_settings%ROWTYPE;
  calculated_players JSONB;
  roster_count INTEGER;
  top_15_cost BIGINT;
  affordable_15_cost BIGINT;
  minimum_price BIGINT;
  maximum_price BIGINT;
  now_at TIMESTAMPTZ := NOW();
BEGIN
  IF NULLIF(BTRIM(authorised_by), '') IS NULL THEN
    RAISE EXCEPTION 'The baseline publication requires an accountable authoriser.' USING ERRCODE='check_violation';
  END IF;

  SELECT * INTO cfg
  FROM public.fantasy_dino_settings s
  WHERE s.season_id = apply_dino_coach_provisional_baseline.target_season_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dino Coach settings are missing.' USING ERRCODE='no_data_found';
  END IF;

  WITH ordered AS (
    SELECT sp.player_id, fp.display_name,
      ROW_NUMBER() OVER (
        ORDER BY md5(sp.player_id::text || target_season_id::text), sp.player_id
      ) AS seed_rank,
      COUNT(*) OVER () AS roster_size
    FROM public.fantasy_season_players sp
    JOIN public.fantasy_players fp ON fp.id = sp.player_id
    WHERE sp.season_id = apply_dino_coach_provisional_baseline.target_season_id
      AND sp.active AND sp.selectable
  ), priced AS (
    SELECT player_id, display_name, seed_rank, roster_size,
      ROUND((
        cfg.initial_price_floor_dino_dollars
        + (cfg.initial_price_ceiling_dino_dollars - cfg.initial_price_floor_dino_dollars)
          * (seed_rank - 1)::NUMERIC / GREATEST(roster_size - 1, 1)
      ) / 1000.0)::BIGINT * 1000 AS price_dino_dollars
    FROM ordered
  )
  SELECT jsonb_agg(jsonb_build_object(
    'player_id', player_id,
    'price_dino_dollars', price_dino_dollars,
    'baseline_points', price_dino_dollars::NUMERIC / cfg.price_point_value_dino_dollars,
    'seed_rank', seed_rank,
    'roster_size', roster_size,
    'display_name', display_name
  ) ORDER BY seed_rank)
  INTO calculated_players
  FROM priced;

  roster_count := COALESCE(jsonb_array_length(calculated_players), 0);
  IF roster_count = 0 THEN
    RAISE EXCEPTION 'No selectable players are configured.' USING ERRCODE='check_violation';
  END IF;

  SELECT COALESCE(SUM(price), 0) INTO top_15_cost FROM (
    SELECT (item->>'price_dino_dollars')::BIGINT AS price
    FROM jsonb_array_elements(calculated_players) item
    ORDER BY price DESC LIMIT 15
  ) highest;
  SELECT COALESCE(SUM(price), 0) INTO affordable_15_cost FROM (
    SELECT (item->>'price_dino_dollars')::BIGINT AS price
    FROM jsonb_array_elements(calculated_players) item
    ORDER BY price ASC LIMIT 15
  ) lowest;
  IF top_15_cost <= cfg.budget_dino_dollars OR affordable_15_cost > cfg.budget_dino_dollars THEN
    RAISE EXCEPTION 'Provisional economy calibration failed: top 15 %, affordable 15 %, budget %.',
      top_15_cost, affordable_15_cost, cfg.budget_dino_dollars USING ERRCODE='check_violation';
  END IF;

  SELECT MIN((item->>'price_dino_dollars')::BIGINT), MAX((item->>'price_dino_dollars')::BIGINT)
  INTO minimum_price, maximum_price FROM jsonb_array_elements(calculated_players) item;

  UPDATE public.fantasy_season_players sp SET
    stats_status = 'provisional_baseline',
    prior_regular_appearances = 0,
    prior_average_points = (item->>'baseline_points')::NUMERIC,
    international_baseline_points = NULL,
    updated_at = now_at
  FROM jsonb_array_elements(calculated_players) item
  WHERE sp.season_id = apply_dino_coach_provisional_baseline.target_season_id
    AND sp.player_id = (item->>'player_id')::UUID
    AND sp.active AND sp.selectable;

  INSERT INTO public.fantasy_player_prices(
    season_id, player_id, effective_round_id, price_dino_dollars, price_million,
    formula_version, prior_baseline_points, previous_rolling_performance_points,
    rolling_performance_points, price_change_dino_dollars, source_status,
    calculation, published_at
  )
  SELECT apply_dino_coach_provisional_baseline.target_season_id,
    (item->>'player_id')::UUID, NULL,
    (item->>'price_dino_dollars')::BIGINT,
    (item->>'price_dino_dollars')::NUMERIC / 1000000.0,
    'dino-provisional-launch-v1', (item->>'baseline_points')::NUMERIC,
    (item->>'baseline_points')::NUMERIC, (item->>'baseline_points')::NUMERIC,
    0, 'provisional_baseline',
    jsonb_build_object(
      'source_status','provisional_baseline',
      'method','deterministic_season_seeded_catalogue_distribution',
      'not_verified_playhq_history',true,
      'authorised_by',BTRIM(authorised_by),
      'seed_rank',(item->>'seed_rank')::INTEGER,
      'roster_size',(item->>'roster_size')::INTEGER,
      'floor_dino_dollars',cfg.initial_price_floor_dino_dollars,
      'ceiling_dino_dollars',cfg.initial_price_ceiling_dino_dollars,
      'budget_dino_dollars',cfg.budget_dino_dollars,
      'published_at',now_at
    ), now_at
  FROM jsonb_array_elements(calculated_players) item
  ON CONFLICT (season_id, player_id, effective_round_id) DO UPDATE SET
    price_dino_dollars = EXCLUDED.price_dino_dollars,
    price_million = EXCLUDED.price_million,
    formula_version = EXCLUDED.formula_version,
    prior_baseline_points = EXCLUDED.prior_baseline_points,
    previous_rolling_performance_points = EXCLUDED.previous_rolling_performance_points,
    rolling_performance_points = EXCLUDED.rolling_performance_points,
    price_change_dino_dollars = 0,
    source_status = EXCLUDED.source_status,
    calculation = EXCLUDED.calculation,
    published_at = EXCLUDED.published_at;

  INSERT INTO public.fantasy_price_calculations(
    season_id, player_id, effective_round_id, formula_version,
    prior_baseline_points, recent_points, previous_rolling_performance_points,
    rolling_performance_points, previous_price_dino_dollars,
    price_change_dino_dollars, new_price_dino_dollars, source_status,
    evidence, published_at
  )
  SELECT apply_dino_coach_provisional_baseline.target_season_id,
    (item->>'player_id')::UUID, NULL, 'dino-provisional-launch-v1',
    (item->>'baseline_points')::NUMERIC, ARRAY[]::NUMERIC[],
    (item->>'baseline_points')::NUMERIC, (item->>'baseline_points')::NUMERIC,
    (item->>'price_dino_dollars')::BIGINT, 0,
    (item->>'price_dino_dollars')::BIGINT, 'provisional_baseline',
    jsonb_build_object(
      'source_status','provisional_baseline',
      'method','deterministic_season_seeded_catalogue_distribution',
      'not_verified_playhq_history',true,
      'authorised_by',BTRIM(authorised_by),
      'seed_rank',(item->>'seed_rank')::INTEGER,
      'roster_size',(item->>'roster_size')::INTEGER
    ), now_at
  FROM jsonb_array_elements(calculated_players) item
  ON CONFLICT (season_id, player_id, effective_round_id, formula_version) DO UPDATE SET
    prior_baseline_points = EXCLUDED.prior_baseline_points,
    recent_points = EXCLUDED.recent_points,
    previous_rolling_performance_points = EXCLUDED.previous_rolling_performance_points,
    rolling_performance_points = EXCLUDED.rolling_performance_points,
    previous_price_dino_dollars = EXCLUDED.previous_price_dino_dollars,
    price_change_dino_dollars = 0,
    new_price_dino_dollars = EXCLUDED.new_price_dino_dollars,
    source_status = EXCLUDED.source_status,
    evidence = EXCLUDED.evidence,
    published_at = EXCLUDED.published_at;

  UPDATE public.fantasy_dino_settings SET
    rules_version = '2026-27-rev02', updated_at = now_at
  WHERE season_id = apply_dino_coach_provisional_baseline.target_season_id;
  UPDATE public.fantasy_seasons SET name = 'Dino Coach 2026/2027', updated_at = now_at
  WHERE id = apply_dino_coach_provisional_baseline.target_season_id;

  RETURN jsonb_build_object(
    'players', roster_count,
    'sourceStatus', 'provisional_baseline',
    'minimumPrice', minimum_price,
    'maximumPrice', maximum_price,
    'top15Cost', top_15_cost,
    'affordable15Cost', affordable_15_cost,
    'budget', cfg.budget_dino_dollars,
    'rulesVersion', '2026-27-rev02',
    'publishedAt', now_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_dino_coach_provisional_baseline(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_dino_coach_provisional_baseline(UUID, TEXT)
  TO service_role;
REVOKE ALL ON FUNCTION public.dino_coach_release_readiness(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dino_coach_release_readiness(UUID)
  TO service_role;
