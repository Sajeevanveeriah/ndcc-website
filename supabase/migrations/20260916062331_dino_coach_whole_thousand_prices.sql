-- Round newly calculated Dino Coach prices upwards to whole 1,000 Dino Dollars.
-- Existing price histories and squad purchase prices are preserved.
CREATE OR REPLACE FUNCTION public.publish_dino_coach_baseline_import(target_batch_id uuid, actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    SELECT CEIL((cfg.initial_price_floor_dino_dollars +
      LEAST(1, GREATEST(0, CASE WHEN r.source_status = 'international_premium'
        THEN best_domestic ELSE r.prior_average_points END / best_domestic)) *
      (cfg.initial_price_ceiling_dino_dollars - cfg.initial_price_floor_dino_dollars))/1000.0)::BIGINT * 1000 AS price
    FROM public.fantasy_baseline_import_rows r WHERE r.batch_id = target_batch_id
  )
  SELECT COALESCE(SUM(price), 0) INTO top_15_cost
  FROM (SELECT price FROM calculated ORDER BY price DESC LIMIT 15) highest;

  WITH calculated AS (
    SELECT CEIL((cfg.initial_price_floor_dino_dollars +
      LEAST(1, GREATEST(0, CASE WHEN r.source_status = 'international_premium'
        THEN best_domestic ELSE r.prior_average_points END / best_domestic)) *
      (cfg.initial_price_ceiling_dino_dollars - cfg.initial_price_floor_dino_dollars))/1000.0)::BIGINT * 1000 AS price
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
      CEIL((cfg.initial_price_floor_dino_dollars +
        LEAST(1, GREATEST(0, CASE WHEN r.source_status = 'international_premium'
          THEN best_domestic ELSE r.prior_average_points END / best_domestic)) *
        (cfg.initial_price_ceiling_dino_dollars - cfg.initial_price_floor_dino_dollars))/1000.0)::BIGINT * 1000 AS price
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
      CEIL((cfg.initial_price_floor_dino_dollars +
        LEAST(1, GREATEST(0, CASE WHEN r.source_status = 'international_premium'
          THEN best_domestic ELSE r.prior_average_points END / best_domestic)) *
        (cfg.initial_price_ceiling_dino_dollars - cfg.initial_price_floor_dino_dollars))/1000.0)::BIGINT * 1000 AS price
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
      CEIL((cfg.initial_price_floor_dino_dollars +
        LEAST(1, GREATEST(0, CASE WHEN r.source_status = 'international_premium'
          THEN best_domestic ELSE r.prior_average_points END / best_domestic)) *
        (cfg.initial_price_ceiling_dino_dollars - cfg.initial_price_floor_dino_dollars))/1000.0)::BIGINT * 1000 AS price
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
$function$
;

CREATE OR REPLACE FUNCTION public.recalculate_dino_coach_applied_baseline(target_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  target_batch_id UUID;
  cfg public.fantasy_dino_settings%ROWTYPE;
  roster_count INTEGER;
  baseline_count INTEGER;
  invalid_count INTEGER;
  best_domestic NUMERIC(12,4);
  top_15_cost BIGINT;
  cheapest_15_cost BIGINT;
BEGIN
  SELECT b.id INTO target_batch_id FROM public.fantasy_baseline_import_batches b
    WHERE b.target_season_id = recalculate_dino_coach_applied_baseline.target_season_id
      AND status = 'applied'
    ORDER BY applied_at DESC LIMIT 1 FOR SHARE;
  IF target_batch_id IS NULL THEN
    RAISE EXCEPTION 'No applied audited baseline exists for this season.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO cfg FROM public.fantasy_dino_settings s
    WHERE s.season_id = recalculate_dino_coach_applied_baseline.target_season_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dino Coach settings are missing.' USING ERRCODE = 'no_data_found'; END IF;

  SELECT COUNT(*) INTO roster_count FROM public.fantasy_season_players sp
    WHERE sp.season_id = recalculate_dino_coach_applied_baseline.target_season_id AND sp.active AND sp.selectable;
  SELECT COUNT(*) INTO baseline_count FROM public.fantasy_baseline_import_rows
    WHERE batch_id = target_batch_id;
  SELECT COUNT(*) INTO invalid_count FROM public.fantasy_season_players sp
    WHERE sp.season_id = recalculate_dino_coach_applied_baseline.target_season_id AND sp.active AND sp.selectable
      AND sp.stats_status NOT IN ('verified_playhq','verified_no_prior_appearance','international_manual','international_premium');
  IF roster_count = 0 OR baseline_count <> roster_count OR invalid_count <> 0 THEN
    RAISE EXCEPTION 'Applied baseline no longer covers every resolved selectable player.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT MAX(sp.prior_average_points) INTO best_domestic
  FROM public.fantasy_season_players sp
  JOIN public.fantasy_players p ON p.id = sp.player_id
  WHERE sp.season_id = recalculate_dino_coach_applied_baseline.target_season_id AND sp.active AND sp.selectable
    AND NOT p.is_international AND sp.stats_status = 'verified_playhq'
    AND sp.prior_regular_appearances > 0;
  IF COALESCE(best_domestic, 0) <= 0 THEN
    RAISE EXCEPTION 'A positive verified domestic baseline is required.' USING ERRCODE = 'check_violation';
  END IF;

  WITH calculated AS (
    SELECT CEIL((cfg.initial_price_floor_dino_dollars +
      LEAST(1, GREATEST(0, sp.prior_average_points / best_domestic)) *
      (cfg.initial_price_ceiling_dino_dollars - cfg.initial_price_floor_dino_dollars))/1000.0)::BIGINT * 1000 AS price
    FROM public.fantasy_season_players sp
    WHERE sp.season_id = recalculate_dino_coach_applied_baseline.target_season_id AND sp.active AND sp.selectable
  ) SELECT COALESCE(SUM(price),0) INTO top_15_cost
    FROM (SELECT price FROM calculated ORDER BY price DESC LIMIT 15) highest;
  WITH calculated AS (
    SELECT CEIL((cfg.initial_price_floor_dino_dollars +
      LEAST(1, GREATEST(0, sp.prior_average_points / best_domestic)) *
      (cfg.initial_price_ceiling_dino_dollars - cfg.initial_price_floor_dino_dollars))/1000.0)::BIGINT * 1000 AS price
    FROM public.fantasy_season_players sp
    WHERE sp.season_id = recalculate_dino_coach_applied_baseline.target_season_id AND sp.active AND sp.selectable
  ) SELECT COALESCE(SUM(price),0) INTO cheapest_15_cost
    FROM (SELECT price FROM calculated ORDER BY price ASC LIMIT 15) lowest;
  IF top_15_cost <= cfg.budget_dino_dollars OR cheapest_15_cost > cfg.budget_dino_dollars THEN
    RAISE EXCEPTION 'Economy calibration failed: top 15 %, cheapest 15 %, budget %.',
      top_15_cost, cheapest_15_cost, cfg.budget_dino_dollars USING ERRCODE = 'check_violation';
  END IF;

  WITH calculated AS (
    SELECT sp.player_id, sp.stats_status, sp.prior_regular_appearances, sp.prior_average_points,
      r.role_neutral_points, r.source_reference,
      CEIL((cfg.initial_price_floor_dino_dollars +
        LEAST(1, GREATEST(0, sp.prior_average_points / best_domestic)) *
        (cfg.initial_price_ceiling_dino_dollars - cfg.initial_price_floor_dino_dollars))/1000.0)::BIGINT * 1000 AS price
    FROM public.fantasy_season_players sp
    JOIN public.fantasy_baseline_import_rows r ON r.batch_id = target_batch_id AND r.player_id = sp.player_id
    WHERE sp.season_id = recalculate_dino_coach_applied_baseline.target_season_id AND sp.active AND sp.selectable
  ), updated AS (
    UPDATE public.fantasy_player_prices p SET
      price_dino_dollars = c.price, price_million = c.price / 1000000.0,
      formula_version = 'dino-baseline-import-v1', prior_baseline_points = c.prior_average_points,
      previous_rolling_performance_points = c.prior_average_points,
      rolling_performance_points = c.prior_average_points, price_change_dino_dollars = 0,
      source_status = c.stats_status,
      calculation = jsonb_build_object('baseline_import_id',target_batch_id,'appearances',c.prior_regular_appearances,
        'role_neutral_points',c.role_neutral_points,'best_domestic_average',best_domestic,
        'source_status',c.stats_status,'source_reference',c.source_reference,
        'international_premium_fallback',c.stats_status='international_premium'),
      published_at = NULL
    FROM calculated c WHERE p.season_id = recalculate_dino_coach_applied_baseline.target_season_id AND p.player_id = c.player_id
      AND p.effective_round_id IS NULL RETURNING p.player_id
  )
  INSERT INTO public.fantasy_player_prices(
    season_id,player_id,effective_round_id,price_dino_dollars,price_million,formula_version,
    prior_baseline_points,previous_rolling_performance_points,rolling_performance_points,
    price_change_dino_dollars,source_status,calculation,published_at
  ) SELECT recalculate_dino_coach_applied_baseline.target_season_id,c.player_id,NULL,c.price,c.price/1000000.0,'dino-baseline-import-v1',
    c.prior_average_points,c.prior_average_points,c.prior_average_points,0,c.stats_status,
    jsonb_build_object('baseline_import_id',target_batch_id,'appearances',c.prior_regular_appearances,
      'role_neutral_points',c.role_neutral_points,'best_domestic_average',best_domestic,
      'source_status',c.stats_status,'source_reference',c.source_reference,
      'international_premium_fallback',c.stats_status='international_premium'),NULL
  FROM calculated c WHERE NOT EXISTS (SELECT 1 FROM updated u WHERE u.player_id = c.player_id);

  INSERT INTO public.fantasy_price_calculations(
    season_id,player_id,effective_round_id,formula_version,prior_baseline_points,recent_points,
    previous_rolling_performance_points,rolling_performance_points,previous_price_dino_dollars,
    price_change_dino_dollars,new_price_dino_dollars,source_status,evidence,published_at
  )
  SELECT recalculate_dino_coach_applied_baseline.target_season_id,sp.player_id,NULL,'dino-baseline-import-v1',sp.prior_average_points,ARRAY[]::NUMERIC[],
    sp.prior_average_points,sp.prior_average_points,p.price_dino_dollars,0,p.price_dino_dollars,sp.stats_status,
    p.calculation,NULL
  FROM public.fantasy_season_players sp
  JOIN public.fantasy_player_prices p ON p.season_id=recalculate_dino_coach_applied_baseline.target_season_id AND p.player_id=sp.player_id AND p.effective_round_id IS NULL
  WHERE sp.season_id=recalculate_dino_coach_applied_baseline.target_season_id AND sp.active AND sp.selectable
  ON CONFLICT (season_id,player_id,effective_round_id,formula_version) DO UPDATE SET
    prior_baseline_points=EXCLUDED.prior_baseline_points,recent_points=EXCLUDED.recent_points,
    previous_rolling_performance_points=EXCLUDED.previous_rolling_performance_points,
    rolling_performance_points=EXCLUDED.rolling_performance_points,
    previous_price_dino_dollars=EXCLUDED.previous_price_dino_dollars,
    price_change_dino_dollars=0,new_price_dino_dollars=EXCLUDED.new_price_dino_dollars,
    source_status=EXCLUDED.source_status,evidence=EXCLUDED.evidence,published_at=NULL;

  RETURN jsonb_build_object('players',roster_count,'bestDomesticAverage',best_domestic,
    'top15Cost',top_15_cost,'cheapest15Cost',cheapest_15_cost,'budget',cfg.budget_dino_dollars);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_dino_coach_provisional_baseline(target_season_id uuid, authorised_by text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      CEIL((
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
$function$
;

CREATE OR REPLACE FUNCTION public.apply_dino_coach_initial_price_recalculation(target_season_id uuid, calculated_players jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cfg public.fantasy_dino_settings%ROWTYPE;
  roster_count INTEGER;
  supplied_count INTEGER;
  top_15_cost BIGINT;
  cheapest_15_cost BIGINT;
BEGIN
  IF jsonb_typeof(calculated_players) <> 'array' THEN
    RAISE EXCEPTION 'Calculated players must be an array.' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO cfg FROM public.fantasy_dino_settings s
    WHERE s.season_id=apply_dino_coach_initial_price_recalculation.target_season_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dino Coach settings are missing.' USING ERRCODE='no_data_found'; END IF;
  SELECT COUNT(*) INTO roster_count FROM public.fantasy_season_players sp
    WHERE sp.season_id=apply_dino_coach_initial_price_recalculation.target_season_id AND sp.active AND sp.selectable;
  SELECT COUNT(*), COUNT(DISTINCT item->>'player_id') INTO supplied_count, top_15_cost
    FROM jsonb_array_elements(calculated_players) item;
  IF supplied_count<>roster_count OR top_15_cost<>roster_count THEN
    RAISE EXCEPTION 'Price recalculation must cover each selectable player exactly once.' USING ERRCODE='check_violation';
  END IF;
  SELECT COUNT(*) INTO supplied_count
  FROM jsonb_array_elements(calculated_players) item
  LEFT JOIN public.fantasy_season_players sp
    ON sp.season_id=apply_dino_coach_initial_price_recalculation.target_season_id
      AND sp.player_id=(item->>'player_id')::UUID AND sp.active AND sp.selectable
  WHERE sp.player_id IS NULL
    OR item->>'stats_status' NOT IN ('verified_playhq','verified_no_prior_appearance','international_manual','international_premium')
    OR (item->>'appearances')::INTEGER < 0
    OR (item->>'baseline_points')::NUMERIC < 0
    OR (item->>'price_dino_dollars')::BIGINT <= 0
    OR jsonb_typeof(item->'evidence') <> 'object';
  IF supplied_count>0 THEN RAISE EXCEPTION 'Price recalculation contains invalid player data.' USING ERRCODE='check_violation'; END IF;

  SELECT jsonb_agg(item || jsonb_build_object('price_dino_dollars',ceil((item->>'price_dino_dollars')::numeric/1000.0)::bigint*1000))
  INTO calculated_players FROM jsonb_array_elements(calculated_players) item;

  SELECT COALESCE(SUM(price),0) INTO top_15_cost FROM (
    SELECT (item->>'price_dino_dollars')::BIGINT price FROM jsonb_array_elements(calculated_players) item
    ORDER BY price DESC LIMIT 15
  ) highest;
  SELECT COALESCE(SUM(price),0) INTO cheapest_15_cost FROM (
    SELECT (item->>'price_dino_dollars')::BIGINT price FROM jsonb_array_elements(calculated_players) item
    ORDER BY price ASC LIMIT 15
  ) lowest;
  IF top_15_cost<=cfg.budget_dino_dollars OR cheapest_15_cost>cfg.budget_dino_dollars THEN
    RAISE EXCEPTION 'Economy calibration failed: top 15 %, cheapest 15 %, budget %.',
      top_15_cost,cheapest_15_cost,cfg.budget_dino_dollars USING ERRCODE='check_violation';
  END IF;

  UPDATE public.fantasy_season_players sp SET
    stats_status=item->>'stats_status', prior_regular_appearances=(item->>'appearances')::INTEGER,
    prior_average_points=(item->>'baseline_points')::NUMERIC,
    international_baseline_points=CASE WHEN item->>'international_baseline_points' IS NULL THEN NULL
      ELSE (item->>'international_baseline_points')::NUMERIC END, updated_at=NOW()
  FROM jsonb_array_elements(calculated_players) item
  WHERE sp.season_id=apply_dino_coach_initial_price_recalculation.target_season_id
    AND sp.player_id=(item->>'player_id')::UUID AND sp.active AND sp.selectable;

  INSERT INTO public.fantasy_player_prices(
    season_id,player_id,effective_round_id,price_dino_dollars,price_million,formula_version,
    prior_baseline_points,previous_rolling_performance_points,rolling_performance_points,
    price_change_dino_dollars,source_status,calculation,published_at
  ) SELECT apply_dino_coach_initial_price_recalculation.target_season_id,(item->>'player_id')::UUID,NULL,
    (item->>'price_dino_dollars')::BIGINT,(item->>'price_dino_dollars')::NUMERIC/1000000.0,
    'dino-initial-v1',(item->>'baseline_points')::NUMERIC,(item->>'baseline_points')::NUMERIC,
    (item->>'baseline_points')::NUMERIC,0,item->>'stats_status',item->'evidence',NULL
  FROM jsonb_array_elements(calculated_players) item
  ON CONFLICT (season_id,player_id,effective_round_id) DO UPDATE SET
    price_dino_dollars=EXCLUDED.price_dino_dollars,price_million=EXCLUDED.price_million,
    formula_version=EXCLUDED.formula_version,prior_baseline_points=EXCLUDED.prior_baseline_points,
    previous_rolling_performance_points=EXCLUDED.previous_rolling_performance_points,
    rolling_performance_points=EXCLUDED.rolling_performance_points,price_change_dino_dollars=0,
    source_status=EXCLUDED.source_status,calculation=EXCLUDED.calculation,published_at=NULL;

  INSERT INTO public.fantasy_price_calculations(
    season_id,player_id,effective_round_id,formula_version,prior_baseline_points,recent_points,
    previous_rolling_performance_points,rolling_performance_points,previous_price_dino_dollars,
    price_change_dino_dollars,new_price_dino_dollars,source_status,evidence,published_at
  ) SELECT apply_dino_coach_initial_price_recalculation.target_season_id,(item->>'player_id')::UUID,NULL,
    'dino-initial-v1',(item->>'baseline_points')::NUMERIC,ARRAY[]::NUMERIC[],(item->>'baseline_points')::NUMERIC,
    (item->>'baseline_points')::NUMERIC,(item->>'price_dino_dollars')::BIGINT,0,
    (item->>'price_dino_dollars')::BIGINT,item->>'stats_status',item->'evidence',NULL
  FROM jsonb_array_elements(calculated_players) item
  ON CONFLICT (season_id,player_id,effective_round_id,formula_version) DO UPDATE SET
    prior_baseline_points=EXCLUDED.prior_baseline_points,recent_points=EXCLUDED.recent_points,
    previous_rolling_performance_points=EXCLUDED.previous_rolling_performance_points,
    rolling_performance_points=EXCLUDED.rolling_performance_points,
    previous_price_dino_dollars=EXCLUDED.previous_price_dino_dollars,price_change_dino_dollars=0,
    new_price_dino_dollars=EXCLUDED.new_price_dino_dollars,source_status=EXCLUDED.source_status,
    evidence=EXCLUDED.evidence,published_at=NULL;
  RETURN jsonb_build_object('players',roster_count,'top15Cost',top_15_cost,
    'cheapest15Cost',cheapest_15_cost,'budget',cfg.budget_dino_dollars);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.settle_dino_price_windows(target_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE cfg public.fantasy_dino_settings%ROWTYPE; r record; p record; old public.fantasy_player_prices%ROWTYPE;
 recent numeric[]; stat_ids uuid[]; stat_fingerprints text[]; baseline numeric; rolling numeric; next_price bigint; changed integer:=0; windows integer:=0; evidence jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('dino-prices:'||target_season_id::text,0));
 SELECT * INTO STRICT cfg FROM public.fantasy_dino_settings WHERE season_id=target_season_id;
 FOR r IN SELECT * FROM public.fantasy_rounds fr WHERE fr.season_id=target_season_id AND fr.pricing_eligible AND fr.round_kind='regular'
 AND fr.round_number>=cfg.price_changes_start_round AND (fr.round_number-cfg.price_changes_start_round)%cfg.price_change_interval_rounds=0
 AND fr.deadline_at IS NOT NULL AND now() >= ((date_trunc('week',fr.deadline_at AT TIME ZONE 'Australia/Melbourne')+interval '7 days 9 hours') AT TIME ZONE 'Australia/Melbourne')
 AND NOT EXISTS(SELECT 1 FROM public.fantasy_price_windows w WHERE w.season_id=target_season_id AND w.round_id=fr.id)
 AND NOT EXISTS(SELECT 1 FROM public.fantasy_price_windows w JOIN public.fantasy_rounds wr ON wr.id=w.round_id WHERE w.season_id=target_season_id AND wr.round_number>fr.round_number)
 AND EXISTS(SELECT 1 FROM public.fantasy_match_stats ms JOIN public.fantasy_import_batches b ON b.id=ms.import_batch_id WHERE ms.round_id=fr.id AND b.status='published')
 ORDER BY fr.round_number LOOP
 changed:=0;
 FOR p IN SELECT * FROM public.fantasy_season_players WHERE season_id=target_season_id AND active AND selectable LOOP
 SELECT * INTO old FROM public.fantasy_player_prices fp WHERE fp.season_id=target_season_id AND fp.player_id=p.player_id AND fp.published_at IS NOT NULL ORDER BY fp.created_at DESC,fp.id DESC LIMIT 1;
 IF old.id IS NULL THEN RAISE EXCEPTION 'Published price missing for %',p.player_id; END IF;
 baseline:=coalesce(old.prior_baseline_points,p.prior_average_points,0);
 SELECT array_agg(points ORDER BY match_date DESC,id DESC),array_agg(id ORDER BY match_date DESC,id DESC),array_agg(fingerprint ORDER BY match_date DESC,id DESC) INTO recent,stat_ids,stat_fingerprints FROM (
 SELECT ms.id,ms.match_date,md5(to_jsonb(ms)::text) AS fingerprint,
 ms.runs*coalesce((cfg.scoring_config->>'runPoints')::numeric,1)+ms.wickets*coalesce((cfg.scoring_config->>'wicketPoints')::numeric,10)+
 ms.catches*coalesce((cfg.scoring_config->>'catchPoints')::numeric,10)+ms.runouts*coalesce((cfg.scoring_config->>'runoutPoints')::numeric,10)+
 ms.maidens*coalesce((cfg.scoring_config->>'maidenPoints')::numeric,5)+ms.stumpings*coalesce((cfg.scoring_config->>'stumpingPoints')::numeric,10)+
 CASE WHEN ms.not_out THEN coalesce((cfg.scoring_config->>'notOutPoints')::numeric,10) ELSE 0 END+
 CASE WHEN ms.runs>=100 THEN coalesce((cfg.scoring_config->>'centuryBonus')::numeric,50) WHEN ms.runs>=50 THEN coalesce((cfg.scoring_config->>'fiftyBonus')::numeric,20) ELSE 0 END+
 CASE WHEN ms.wickets>=7 THEN coalesce((cfg.scoring_config->>'sevenWicketBonus')::numeric,50) WHEN ms.wickets>=5 THEN coalesce((cfg.scoring_config->>'fiveWicketBonus')::numeric,25) ELSE 0 END AS points
 FROM public.fantasy_match_stats ms JOIN public.fantasy_rounds fr ON fr.id=ms.round_id JOIN public.fantasy_import_batches b ON b.id=ms.import_batch_id
 WHERE ms.season_id=target_season_id AND ms.player_id=p.player_id AND fr.round_number<=r.round_number AND fr.pricing_eligible AND fr.round_kind='regular' AND b.status='published' AND ms.match_date<=current_date
 AND NOT EXISTS(SELECT 1 FROM public.fantasy_priced_appearances a WHERE a.season_id=target_season_id AND a.stat_id=ms.id AND a.fingerprint=md5(to_jsonb(ms)::text))
 ORDER BY ms.match_date DESC,ms.id DESC) scored;
 IF recent IS NULL THEN rolling:=coalesce(old.rolling_performance_points,baseline);
 ELSIF cardinality(recent)=1 THEN rolling:=round(baseline*(cfg.rolling_baseline_weight+cfg.rolling_recent_game_weight)+recent[1]*cfg.rolling_recent_game_weight,4);
 ELSE SELECT round(baseline*cfg.rolling_baseline_weight+avg(v)*2*cfg.rolling_recent_game_weight,4) INTO rolling FROM unnest(recent) v; END IF;
 next_price:=greatest(cfg.initial_price_floor_dino_dollars,least(cfg.initial_price_ceiling_dino_dollars,ceil((old.price_dino_dollars+(rolling-coalesce(old.rolling_performance_points,baseline))*cfg.price_point_value_dino_dollars)/1000.0)::bigint*1000));
 evidence:=jsonb_build_object('round',r.round_number,'cutoff',now(),'recent_points',coalesce(recent,ARRAY[]::numeric[]),'previous_price_id',old.id,'late_results','next settlement');
 INSERT INTO public.fantasy_player_prices(season_id,player_id,effective_round_id,price_dino_dollars,price_million,formula_version,prior_baseline_points,previous_rolling_performance_points,rolling_performance_points,price_change_dino_dollars,source_status,calculation,published_at)
 VALUES(target_season_id,p.player_id,r.id,next_price,next_price/1000000.0,'dino-two-round-v1',baseline,coalesce(old.rolling_performance_points,baseline),rolling,next_price-old.price_dino_dollars,old.source_status,evidence,now());
 UPDATE public.fantasy_player_prices SET created_at=clock_timestamp() WHERE season_id=target_season_id AND player_id=p.player_id AND effective_round_id=r.id;
 INSERT INTO public.fantasy_price_calculations(season_id,player_id,effective_round_id,formula_version,prior_baseline_points,recent_points,previous_rolling_performance_points,rolling_performance_points,previous_price_dino_dollars,price_change_dino_dollars,new_price_dino_dollars,source_status,evidence,published_at)
 VALUES(target_season_id,p.player_id,r.id,'dino-two-round-v1',baseline,coalesce(recent,ARRAY[]::numeric[]),coalesce(old.rolling_performance_points,baseline),rolling,old.price_dino_dollars,next_price-old.price_dino_dollars,next_price,old.source_status,evidence,now());
 INSERT INTO public.fantasy_priced_appearances(season_id,stat_id,fingerprint,round_id)
 SELECT target_season_id,stat_ids[i],stat_fingerprints[i],r.id FROM generate_subscripts(stat_ids,1) i
 ON CONFLICT(season_id,stat_id) DO UPDATE SET fingerprint=EXCLUDED.fingerprint,round_id=EXCLUDED.round_id;
 changed:=changed+1;
 END LOOP;
 INSERT INTO public.fantasy_price_windows(season_id,round_id,player_count) VALUES(target_season_id,r.id,changed);
 windows:=windows+1;
 END LOOP;
 RETURN jsonb_build_object('windows',windows,'players_last_window',changed);
END $function$
;

CREATE OR REPLACE FUNCTION public.override_dino_player_price(target_season_id uuid, target_player_id uuid, new_price bigint, reason text, actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE old public.fantasy_player_prices%ROWTYPE; cfg public.fantasy_dino_settings%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('dino-prices:'||target_season_id::text,0));
 SELECT * INTO STRICT cfg FROM public.fantasy_dino_settings WHERE season_id=target_season_id;
 new_price:=ceil(new_price/1000.0)::bigint*1000;
 IF new_price IS NULL OR new_price<cfg.initial_price_floor_dino_dollars OR new_price>cfg.initial_price_ceiling_dino_dollars OR length(trim(coalesce(actor,'')))=0 THEN RAISE EXCEPTION 'Valid price, reason and actor required'; END IF;
 SELECT * INTO old FROM public.fantasy_player_prices WHERE season_id=target_season_id AND player_id=target_player_id AND published_at IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
 IF old.id IS NOT NULL AND old.price_dino_dollars=new_price THEN RETURN jsonb_build_object('unchanged',true); END IF;
 IF length(trim(coalesce(reason,'')))<5 THEN RAISE EXCEPTION 'Explain the manual price change in at least five characters'; END IF;
 IF old.id IS NULL THEN
 INSERT INTO public.fantasy_player_prices(season_id,player_id,price_dino_dollars,price_million,formula_version,source_status,prior_baseline_points,rolling_performance_points,published_at)
 VALUES(target_season_id,target_player_id,new_price,new_price/1000000.0,'dino-manual-v1','unrated',0,0,now());
 ELSE
 IF old.price_dino_dollars=new_price THEN RETURN jsonb_build_object('unchanged',true); END IF;
 UPDATE public.fantasy_player_prices SET price_dino_dollars=new_price,price_million=new_price/1000000.0,calculation=calculation||jsonb_build_object('manual_reason',reason,'manual_actor',actor,'manual_at',now()) WHERE id=old.id;
 END IF;
 INSERT INTO public.fantasy_manual_price_audit(season_id,player_id,old_price,new_price,reason,actor) VALUES(target_season_id,target_player_id,old.price_dino_dollars,new_price,reason,actor);
 RETURN jsonb_build_object('price_dino_dollars',new_price);
END $function$
;