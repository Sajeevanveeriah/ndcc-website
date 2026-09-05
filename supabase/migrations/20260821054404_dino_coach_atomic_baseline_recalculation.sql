-- Recalculate every opening price from the latest applied audited baseline in
-- one transaction. This is the CMS-safe path after changing global economy
-- settings; it never publishes prices.
CREATE OR REPLACE FUNCTION public.recalculate_dino_coach_applied_baseline(target_season_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
    SELECT ROUND(cfg.initial_price_floor_dino_dollars +
      LEAST(1, GREATEST(0, sp.prior_average_points / best_domestic)) *
      (cfg.initial_price_ceiling_dino_dollars - cfg.initial_price_floor_dino_dollars))::BIGINT AS price
    FROM public.fantasy_season_players sp
    WHERE sp.season_id = recalculate_dino_coach_applied_baseline.target_season_id AND sp.active AND sp.selectable
  ) SELECT COALESCE(SUM(price),0) INTO top_15_cost
    FROM (SELECT price FROM calculated ORDER BY price DESC LIMIT 15) highest;
  WITH calculated AS (
    SELECT ROUND(cfg.initial_price_floor_dino_dollars +
      LEAST(1, GREATEST(0, sp.prior_average_points / best_domestic)) *
      (cfg.initial_price_ceiling_dino_dollars - cfg.initial_price_floor_dino_dollars))::BIGINT AS price
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
      ROUND(cfg.initial_price_floor_dino_dollars +
        LEAST(1, GREATEST(0, sp.prior_average_points / best_domestic)) *
        (cfg.initial_price_ceiling_dino_dollars - cfg.initial_price_floor_dino_dollars))::BIGINT AS price
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
  SELECT recalculate_dino_coach_applied_baseline.target_season_id,sp.player_id,NULL,'dino-baseline-import-v1',sp.prior_average_points,'[]'::JSONB,
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
    source_status=EXCLUDED.source_status,evidence=EXCLUDED.evidence,published_at=NULL,calculated_at=NOW();

  RETURN jsonb_build_object('players',roster_count,'bestDomesticAverage',best_domestic,
    'top15Cost',top_15_cost,'cheapest15Cost',cheapest_15_cost,'budget',cfg.budget_dino_dollars);
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_dino_coach_applied_baseline(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_dino_coach_applied_baseline(UUID) TO service_role;
