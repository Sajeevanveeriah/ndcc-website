-- Initial Dino Coach squad RPC. A forward migration replaces this with the price-authoritative v2 RPC.
CREATE OR REPLACE FUNCTION save_dino_coach_squad(target_manager_id UUID,target_season_id UUID,target_round_id UUID,target_status TEXT,target_budget_dino_dollars BIGINT,selected_players JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg fantasy_dino_settings%ROWTYPE; target_squad_id UUID; expected_players INTEGER;
BEGIN
  SELECT * INTO cfg FROM fantasy_dino_settings WHERE season_id=target_season_id;
  IF NOT FOUND OR NOT cfg.public_launch_enabled OR NOT cfg.team_selection_open THEN RAISE EXCEPTION 'Dino Coach team selection is closed.' USING ERRCODE='check_violation'; END IF;
  IF NOT EXISTS(SELECT 1 FROM fantasy_managers WHERE id=target_manager_id AND age_verified_at IS NOT NULL AND team_name_status IN ('approved','replaced') AND rules_version_accepted=cfg.rules_version AND is_active=TRUE) THEN RAISE EXCEPTION 'Dino Coach manager eligibility is incomplete.' USING ERRCODE='check_violation'; END IF;
  IF NOT EXISTS(SELECT 1 FROM fantasy_entries WHERE manager_id=target_manager_id AND season_id=target_season_id AND status='paid') THEN RAISE EXCEPTION 'The Dino Coach entry fee must be paid.' USING ERRCODE='check_violation'; END IF;
  IF target_status NOT IN ('draft','submitted') THEN RAISE EXCEPTION 'Invalid squad status.'; END IF;
  IF target_budget_dino_dollars<0 OR target_budget_dino_dollars>cfg.budget_dino_dollars THEN RAISE EXCEPTION 'Dino Coach squad budget exceeded.' USING ERRCODE='check_violation'; END IF;
  SELECT COALESCE(SUM(value::INTEGER),0) INTO expected_players FROM (SELECT value FROM jsonb_each_text(cfg.slot_counts->'starter') UNION ALL SELECT value FROM jsonb_each_text(cfg.slot_counts->'bench')) x;
  IF target_status='submitted' AND jsonb_array_length(selected_players)<>expected_players THEN RAISE EXCEPTION 'Every Dino Coach squad slot must be filled.' USING ERRCODE='check_violation'; END IF;
  SELECT id INTO target_squad_id FROM fantasy_squads WHERE manager_id=target_manager_id AND season_id=target_season_id AND round_id IS NOT DISTINCT FROM target_round_id LIMIT 1 FOR UPDATE;
  IF target_squad_id IS NULL THEN INSERT INTO fantasy_squads(manager_id,season_id,round_id,status,budget_used,budget_used_dino_dollars) VALUES(target_manager_id,target_season_id,target_round_id,target_status,target_budget_dino_dollars/1000000.0,target_budget_dino_dollars) RETURNING id INTO target_squad_id;
  ELSE UPDATE fantasy_squads SET status=target_status,budget_used=target_budget_dino_dollars/1000000.0,budget_used_dino_dollars=target_budget_dino_dollars,updated_at=NOW() WHERE id=target_squad_id; DELETE FROM fantasy_squad_players WHERE squad_id=target_squad_id; END IF;
  INSERT INTO fantasy_squad_players(squad_id,player_id,position_type,bench_order,is_captain,is_vice_captain,slot_key,assigned_role,purchase_price_dino_dollars)
  SELECT target_squad_id,(item->>'player_id')::UUID,item->>'position_type',NULLIF(item->>'bench_order','')::INTEGER,COALESCE((item->>'is_captain')::BOOLEAN,FALSE),COALESCE((item->>'is_vice_captain')::BOOLEAN,FALSE),item->>'slot_key',item->>'assigned_role',COALESCE((item->>'purchase_price_dino_dollars')::BIGINT,0) FROM jsonb_array_elements(selected_players) item;
  RETURN target_squad_id;
END; $$;
REVOKE ALL ON FUNCTION save_dino_coach_squad(UUID,UUID,UUID,TEXT,BIGINT,JSONB) FROM PUBLIC,anon,authenticated;
