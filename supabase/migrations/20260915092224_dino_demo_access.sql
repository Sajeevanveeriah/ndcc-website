-- Demo eligibility is an explicit administrator grant, separate from payment status.
ALTER TABLE public.fantasy_entries
  ADD COLUMN is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN demo_authorisation text,
  ADD COLUMN demo_granted_at timestamptz,
  ADD CONSTRAINT fantasy_demo_authorisation CHECK
    (NOT is_demo OR (length(trim(demo_authorisation)) > 0 AND demo_authorisation IS NOT NULL AND demo_granted_at IS NOT NULL));
COMMENT ON COLUMN public.fantasy_entries.is_demo IS 'Administrator-only payment exemption for non-prize demo teams. Never payment evidence.';
CREATE OR REPLACE FUNCTION public.save_dino_coach_squad(target_manager_id uuid, target_season_id uuid, target_round_id uuid, target_status text, target_budget_dino_dollars bigint, selected_players jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cfg public.fantasy_dino_settings%ROWTYPE;
  target_squad_id UUID;
  expected_players INTEGER;
  actual_budget BIGINT;
  item_count INTEGER;
  invalid_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(target_manager_id::text || ':' || target_season_id::text,0));
  IF target_status NOT IN ('draft','submitted') OR jsonb_typeof(selected_players) <> 'array' THEN
    RAISE EXCEPTION 'Invalid Dino Coach squad request.' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO cfg FROM public.fantasy_dino_settings WHERE season_id=target_season_id FOR SHARE;
  IF NOT FOUND OR NOT cfg.public_launch_enabled OR NOT cfg.team_selection_open THEN
    RAISE EXCEPTION 'Dino Coach team selection is closed.' USING ERRCODE='check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.fantasy_managers m
    JOIN public.fantasy_entries e ON e.manager_id=m.id AND e.season_id=target_season_id AND (e.status='paid' OR e.is_demo)
    WHERE m.id=target_manager_id AND m.age_verified_at IS NOT NULL
      AND m.team_name_status IN ('approved','replaced') AND m.rules_version_accepted=cfg.rules_version AND m.is_active
  ) THEN RAISE EXCEPTION 'Dino Coach manager eligibility is incomplete.' USING ERRCODE='check_violation'; END IF;

  SELECT COUNT(*), COUNT(DISTINCT item->>'player_id'), COUNT(DISTINCT item->>'slot_key')
    INTO item_count, invalid_count, expected_players FROM jsonb_array_elements(selected_players) item;
  IF item_count > 15 OR item_count <> invalid_count OR item_count <> expected_players THEN
    RAISE EXCEPTION 'Dino Coach squad contains duplicate players or slots.' USING ERRCODE='check_violation';
  END IF;
  IF target_status='submitted' AND item_count<>15 THEN
    RAISE EXCEPTION 'Every Dino Coach squad slot must be filled.' USING ERRCODE='check_violation';
  END IF;

  WITH supplied AS (
    SELECT item, item->>'slot_key' slot_key, (item->>'player_id')::UUID player_id
    FROM jsonb_array_elements(selected_players) item
  ), valid_slots(slot_key, assigned_role, position_type) AS (VALUES
    ('XI_BAT_1','BAT','starter'),('XI_BAT_2','BAT','starter'),('XI_BAT_3','BAT','starter'),('XI_BAT_4','BAT','starter'),
    ('XI_AR_1','AR','starter'),('XI_AR_2','AR','starter'),('XI_WK_1','WK','starter'),
    ('XI_BOWL_1','BOWL','starter'),('XI_BOWL_2','BOWL','starter'),('XI_BOWL_3','BOWL','starter'),('XI_BOWL_4','BOWL','starter'),
    ('BENCH_BAT_1','BAT','bench'),('BENCH_AR_1','AR','bench'),('BENCH_WK_1','WK','bench'),('BENCH_BOWL_1','BOWL','bench')
  )
  SELECT COUNT(*) INTO invalid_count FROM supplied s
  LEFT JOIN valid_slots v ON v.slot_key=s.slot_key
  LEFT JOIN public.fantasy_season_players sp ON sp.season_id=target_season_id AND sp.player_id=s.player_id AND sp.active AND sp.selectable
  WHERE v.slot_key IS NULL OR sp.player_id IS NULL
    OR s.item->>'assigned_role' IS DISTINCT FROM v.assigned_role OR s.item->>'position_type' IS DISTINCT FROM v.position_type;
  IF invalid_count>0 THEN RAISE EXCEPTION 'Dino Coach squad has an invalid slot or player.' USING ERRCODE='check_violation'; END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(selected_players) item
    WHERE COALESCE((item->>'is_captain')::boolean,false) AND COALESCE((item->>'is_vice_captain')::boolean,false)) THEN
    RAISE EXCEPTION 'Captain and vice-captain must be different players.' USING ERRCODE='check_violation';
  END IF;
  IF target_status='submitted' THEN
    SELECT COUNT(*) INTO invalid_count FROM jsonb_array_elements(selected_players) item
      WHERE COALESCE((item->>'is_captain')::BOOLEAN,FALSE);
    IF invalid_count<>1 THEN RAISE EXCEPTION 'Exactly one captain is required.' USING ERRCODE='check_violation'; END IF;
    SELECT COUNT(*) INTO invalid_count FROM jsonb_array_elements(selected_players) item
      WHERE COALESCE((item->>'is_vice_captain')::BOOLEAN,FALSE);
    IF invalid_count<>1 THEN RAISE EXCEPTION 'Exactly one vice-captain is required.' USING ERRCODE='check_violation'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(selected_players) item
      WHERE (COALESCE((item->>'is_captain')::BOOLEAN,FALSE) OR COALESCE((item->>'is_vice_captain')::BOOLEAN,FALSE))
        AND item->>'position_type'<>'starter') THEN
      RAISE EXCEPTION 'Captain and vice-captain must be in the playing XI.' USING ERRCODE='check_violation';
    END IF;
  END IF;

  WITH chosen AS (SELECT (item->>'player_id')::UUID player_id FROM jsonb_array_elements(selected_players) item),
  latest AS (
    SELECT DISTINCT ON (p.player_id) p.player_id,p.price_dino_dollars
    FROM public.fantasy_player_prices p JOIN chosen c USING(player_id)
    WHERE p.season_id=target_season_id AND p.published_at IS NOT NULL AND p.price_dino_dollars>0
    ORDER BY p.player_id,p.created_at DESC
  ) SELECT COALESCE(SUM(price_dino_dollars),0),COUNT(*) INTO actual_budget,invalid_count FROM latest;
  IF invalid_count<>item_count THEN RAISE EXCEPTION 'Every selected player needs a positive published price.' USING ERRCODE='check_violation'; END IF;
  IF actual_budget>cfg.budget_dino_dollars OR actual_budget<>target_budget_dino_dollars THEN
    RAISE EXCEPTION 'Dino Coach squad budget or price evidence is invalid.' USING ERRCODE='check_violation';
  END IF;

  SELECT id INTO target_squad_id FROM public.fantasy_squads
  WHERE manager_id=target_manager_id AND season_id=target_season_id AND round_id IS NOT DISTINCT FROM target_round_id
  LIMIT 1 FOR UPDATE;
  IF target_squad_id IS NULL THEN
    INSERT INTO public.fantasy_squads(manager_id,season_id,round_id,status,budget_used,budget_used_dino_dollars)
    VALUES(target_manager_id,target_season_id,target_round_id,target_status,actual_budget/1000000.0,actual_budget)
    RETURNING id INTO target_squad_id;
  ELSE
    UPDATE public.fantasy_squads SET status=target_status,budget_used=actual_budget/1000000.0,
      budget_used_dino_dollars=actual_budget,updated_at=NOW() WHERE id=target_squad_id;
    DELETE FROM public.fantasy_squad_players WHERE squad_id=target_squad_id;
  END IF;
  INSERT INTO public.fantasy_squad_players(squad_id,player_id,position_type,bench_order,is_captain,is_vice_captain,slot_key,assigned_role,purchase_price_dino_dollars)
  SELECT target_squad_id,(item->>'player_id')::UUID,item->>'position_type',
    CASE WHEN item->>'position_type'='bench' THEN ROW_NUMBER() OVER (ORDER BY item->>'slot_key')::INTEGER ELSE NULL END,
    COALESCE((item->>'is_captain')::BOOLEAN,FALSE),COALESCE((item->>'is_vice_captain')::BOOLEAN,FALSE),
    item->>'slot_key',item->>'assigned_role',p.price_dino_dollars
  FROM jsonb_array_elements(selected_players) item
  JOIN LATERAL (SELECT price_dino_dollars FROM public.fantasy_player_prices
    WHERE season_id=target_season_id AND player_id=(item->>'player_id')::UUID AND published_at IS NOT NULL
    ORDER BY created_at DESC LIMIT 1) p ON TRUE;
  RETURN target_squad_id;
END; $function$
;
REVOKE ALL ON FUNCTION public.save_dino_coach_squad(uuid,uuid,uuid,text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_dino_coach_squad(uuid,uuid,uuid,text,bigint,jsonb) TO service_role;
