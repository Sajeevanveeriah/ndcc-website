-- Apply PlayHQ-derived opening prices and publish all opening prices using
-- transaction-scoped, full-roster database contracts.
CREATE OR REPLACE FUNCTION public.apply_dino_coach_initial_price_recalculation(
  target_season_id UUID,
  calculated_players JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
    'dino-initial-v1',(item->>'baseline_points')::NUMERIC,'[]'::JSONB,(item->>'baseline_points')::NUMERIC,
    (item->>'baseline_points')::NUMERIC,(item->>'price_dino_dollars')::BIGINT,0,
    (item->>'price_dino_dollars')::BIGINT,item->>'stats_status',item->'evidence',NULL
  FROM jsonb_array_elements(calculated_players) item
  ON CONFLICT (season_id,player_id,effective_round_id,formula_version) DO UPDATE SET
    prior_baseline_points=EXCLUDED.prior_baseline_points,recent_points=EXCLUDED.recent_points,
    previous_rolling_performance_points=EXCLUDED.previous_rolling_performance_points,
    rolling_performance_points=EXCLUDED.rolling_performance_points,
    previous_price_dino_dollars=EXCLUDED.previous_price_dino_dollars,price_change_dino_dollars=0,
    new_price_dino_dollars=EXCLUDED.new_price_dino_dollars,source_status=EXCLUDED.source_status,
    evidence=EXCLUDED.evidence,published_at=NULL,calculated_at=NOW();
  RETURN jsonb_build_object('players',roster_count,'top15Cost',top_15_cost,
    'cheapest15Cost',cheapest_15_cost,'budget',cfg.budget_dino_dollars);
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_dino_coach_initial_prices(target_season_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE roster_count INTEGER; valid_count INTEGER; calculation_count INTEGER; now_at TIMESTAMPTZ:=NOW();
BEGIN
  SELECT COUNT(*) INTO roster_count FROM public.fantasy_season_players sp
    WHERE sp.season_id=publish_dino_coach_initial_prices.target_season_id AND sp.active AND sp.selectable;
  SELECT COUNT(*) INTO valid_count FROM public.fantasy_season_players sp
  JOIN public.fantasy_player_prices p ON p.season_id=sp.season_id AND p.player_id=sp.player_id AND p.effective_round_id IS NULL
  WHERE sp.season_id=publish_dino_coach_initial_prices.target_season_id AND sp.active AND sp.selectable
    AND sp.stats_status IN ('verified_playhq','verified_no_prior_appearance','international_manual','international_premium')
    AND p.price_dino_dollars>0 AND p.source_status=sp.stats_status;
  IF roster_count=0 OR valid_count<>roster_count THEN
    RAISE EXCEPTION 'Every selectable player needs a resolved outcome and positive draft price.' USING ERRCODE='check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fantasy_player_identity_audit a
      WHERE a.season_id=publish_dino_coach_initial_prices.target_season_id AND a.decision='review_required')
    OR EXISTS (SELECT playhq_player_id FROM public.fantasy_player_identity_audit a
      WHERE a.season_id=publish_dino_coach_initial_prices.target_season_id AND a.playhq_player_id IS NOT NULL
      GROUP BY playhq_player_id HAVING COUNT(*)>1) THEN
    RAISE EXCEPTION 'Player identity reconciliation is incomplete.' USING ERRCODE='check_violation';
  END IF;
  UPDATE public.fantasy_player_prices p SET published_at=now_at
    FROM public.fantasy_season_players sp
    WHERE sp.season_id=publish_dino_coach_initial_prices.target_season_id AND sp.active AND sp.selectable
      AND p.season_id=sp.season_id AND p.player_id=sp.player_id AND p.effective_round_id IS NULL;
  UPDATE public.fantasy_price_calculations c SET published_at=now_at
    FROM public.fantasy_season_players sp
    WHERE sp.season_id=publish_dino_coach_initial_prices.target_season_id AND sp.active AND sp.selectable
      AND c.season_id=sp.season_id AND c.player_id=sp.player_id AND c.effective_round_id IS NULL;
  GET DIAGNOSTICS calculation_count=ROW_COUNT;
  IF calculation_count<>roster_count THEN
    RAISE EXCEPTION 'Auditable price calculation coverage is incomplete.' USING ERRCODE='check_violation';
  END IF;
  RETURN jsonb_build_object('players',roster_count,'publishedAt',now_at);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_dino_coach_initial_price_recalculation(UUID,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.publish_dino_coach_initial_prices(UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_dino_coach_initial_price_recalculation(UUID,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_dino_coach_initial_prices(UUID) TO service_role;
