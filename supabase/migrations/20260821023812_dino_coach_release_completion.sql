-- Forward-only Dino Coach release controls. Launch remains closed until the
-- release-readiness function proves every selectable player is resolved and
-- has a positive published price.

ALTER TABLE fantasy_dino_settings
  ADD COLUMN IF NOT EXISTS notification_recipients TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS international_baseline_strategy TEXT NOT NULL DEFAULT 'top_domestic_equivalent',
  ADD COLUMN IF NOT EXISTS rollover_strategy TEXT NOT NULL DEFAULT 'previous_regular_season',
  ADD COLUMN IF NOT EXISTS squad_value_prize_description TEXT,
  ADD COLUMN IF NOT EXISTS leaderboard_tiebreaker TEXT NOT NULL DEFAULT 'total_points_desc_squad_value_desc_team_name_asc';

CREATE TABLE IF NOT EXISTS fantasy_entry_payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES fantasy_entries(id) ON DELETE RESTRICT,
  provider_event_id TEXT NOT NULL UNIQUE,
  provider_event_type TEXT NOT NULL,
  provider_created_at TIMESTAMPTZ,
  resulting_status TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fantasy_entry_payment_events_entry_idx
  ON fantasy_entry_payment_events(entry_id, created_at DESC);
ALTER TABLE fantasy_entry_payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fantasy_entry_payment_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION dino_coach_release_readiness(target_season_id UUID)
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
    COUNT(*) FILTER (WHERE r.stats_status IN ('verified_playhq','verified_no_prior_appearance','international_manual','international_premium'))::BIGINT AS resolved,
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
REVOKE ALL ON FUNCTION dino_coach_release_readiness(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION save_dino_coach_squad(
  target_manager_id UUID,
  target_season_id UUID,
  target_round_id UUID,
  target_status TEXT,
  target_budget_dino_dollars BIGINT,
  selected_players JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  cfg public.fantasy_dino_settings%ROWTYPE;
  target_squad_id UUID;
  expected_players INTEGER;
  actual_budget BIGINT;
  item_count INTEGER;
  invalid_count INTEGER;
BEGIN
  IF target_status NOT IN ('draft','submitted') OR jsonb_typeof(selected_players) <> 'array' THEN
    RAISE EXCEPTION 'Invalid Dino Coach squad request.' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO cfg FROM public.fantasy_dino_settings WHERE season_id=target_season_id FOR SHARE;
  IF NOT FOUND OR NOT cfg.public_launch_enabled OR NOT cfg.team_selection_open THEN
    RAISE EXCEPTION 'Dino Coach team selection is closed.' USING ERRCODE='check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.fantasy_managers m
    JOIN public.fantasy_entries e ON e.manager_id=m.id AND e.season_id=target_season_id AND e.status='paid'
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
    OR s.item->>'assigned_role'<>v.assigned_role OR s.item->>'position_type'<>v.position_type;
  IF invalid_count>0 THEN RAISE EXCEPTION 'Dino Coach squad has an invalid slot or player.' USING ERRCODE='check_violation'; END IF;

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
END; $$;
REVOKE ALL ON FUNCTION save_dino_coach_squad(UUID,UUID,UUID,TEXT,BIGINT,JSONB) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION make_dino_coach_transfer(target_manager_id UUID,target_season_id UUID,target_round_id UUID,player_out UUID,player_in UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_squad_id UUID; transfer_id UUID; incoming_price BIGINT; outgoing_price BIGINT; current_budget BIGINT; next_budget BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(target_manager_id::TEXT||':'||target_season_id::TEXT,0));
  IF NOT public.dino_coach_transfer_window_open(target_season_id,NOW()) THEN RAISE EXCEPTION 'Dino Coach transfer window is closed.' USING ERRCODE='check_violation'; END IF;
  IF player_in=player_out THEN RAISE EXCEPTION 'Choose a different incoming player.' USING ERRCODE='check_violation'; END IF;
  SELECT s.id,s.budget_used_dino_dollars INTO target_squad_id,current_budget FROM public.fantasy_squads s
    WHERE s.manager_id=target_manager_id AND s.season_id=target_season_id ORDER BY s.created_at DESC LIMIT 1 FOR UPDATE;
  IF target_squad_id IS NULL THEN RAISE EXCEPTION 'Submit a Dino Coach squad before making transfers.' USING ERRCODE='check_violation'; END IF;
  IF EXISTS(SELECT 1 FROM public.fantasy_squad_players WHERE squad_id=target_squad_id AND player_id=player_in) THEN RAISE EXCEPTION 'Incoming player is already in the squad.' USING ERRCODE='check_violation'; END IF;
  SELECT purchase_price_dino_dollars INTO outgoing_price FROM public.fantasy_squad_players WHERE squad_id=target_squad_id AND player_id=player_out FOR UPDATE;
  IF outgoing_price IS NULL THEN RAISE EXCEPTION 'Outgoing player is not in the squad.' USING ERRCODE='check_violation'; END IF;
  SELECT p.price_dino_dollars INTO incoming_price FROM public.fantasy_player_prices p
    JOIN public.fantasy_season_players sp ON sp.season_id=target_season_id AND sp.player_id=p.player_id AND sp.active AND sp.selectable
    WHERE p.season_id=target_season_id AND p.player_id=player_in AND p.published_at IS NOT NULL AND p.price_dino_dollars>0
    ORDER BY p.created_at DESC LIMIT 1;
  IF incoming_price IS NULL THEN RAISE EXCEPTION 'Incoming player has no positive published price.' USING ERRCODE='check_violation'; END IF;
  next_budget:=current_budget-outgoing_price+incoming_price;
  IF next_budget>(SELECT budget_dino_dollars FROM public.fantasy_dino_settings WHERE season_id=target_season_id) THEN RAISE EXCEPTION 'Transfer exceeds the Dino Dollar budget.' USING ERRCODE='check_violation'; END IF;
  UPDATE public.fantasy_squad_players SET player_id=player_in,purchase_price_dino_dollars=incoming_price WHERE squad_id=target_squad_id AND player_id=player_out;
  UPDATE public.fantasy_squads SET budget_used_dino_dollars=next_budget,budget_used=next_budget/1000000.0,updated_at=NOW() WHERE id=target_squad_id;
  INSERT INTO public.fantasy_transfers(manager_id,season_id,round_id,player_out_id,player_in_id,penalty_points)
    VALUES(target_manager_id,target_season_id,target_round_id,player_out,player_in,0) RETURNING id INTO transfer_id;
  RETURN transfer_id;
END; $$;
REVOKE ALL ON FUNCTION make_dino_coach_transfer(UUID,UUID,UUID,UUID,UUID) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION set_dino_coach_launch_state(
  target_season_id UUID, launch_enabled BOOLEAN, registration_enabled BOOLEAN, selection_enabled BOOLEAN
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE release_ready BOOLEAN;
BEGIN
  IF launch_enabled OR registration_enabled OR selection_enabled THEN
    SELECT ready INTO release_ready FROM public.dino_coach_release_readiness(target_season_id);
    IF NOT COALESCE(release_ready,FALSE) THEN RAISE EXCEPTION 'Dino Coach release-readiness gate failed.' USING ERRCODE='check_violation'; END IF;
  END IF;
  UPDATE public.fantasy_dino_settings SET public_launch_enabled=launch_enabled,
    registration_open=registration_enabled,team_selection_open=selection_enabled,updated_at=NOW()
  WHERE season_id=target_season_id;
  UPDATE public.fantasy_settings SET is_registration_open=registration_enabled,
    is_team_selection_open=selection_enabled,updated_at=NOW() WHERE season_id=target_season_id;
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION set_dino_coach_launch_state(UUID,BOOLEAN,BOOLEAN,BOOLEAN) FROM PUBLIC,anon,authenticated;

UPDATE fantasy_dino_settings SET pilot_notice =
  'Dino Coach is running as a pilot for the 2026/2027 season. Feedback and suggestions are welcome. If a scoring defect, data issue, technical fault or unintended rules outcome is identified, the league manager may make a reasonable adjustment to protect the fairness and operation of the competition. Material changes will be communicated to participants and recorded. Changes will not be applied secretly.'
WHERE season_id IN (SELECT id FROM fantasy_seasons WHERE is_current=TRUE);
