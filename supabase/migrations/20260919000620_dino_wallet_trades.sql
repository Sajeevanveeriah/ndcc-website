-- Release SQL: review and apply atomically after the application is ready.
-- Existing budgets increase by 5 million; purchase costs remain intact.
BEGIN;
UPDATE public.fantasy_dino_settings SET budget_dino_dollars=15000000,rules_version='2026-27-rev05' WHERE season_id IN (SELECT id FROM public.fantasy_seasons WHERE is_current) AND budget_dino_dollars=10000000;
UPDATE public.fantasy_settings SET squad_budget=15 WHERE season_id IN (SELECT id FROM public.fantasy_seasons WHERE is_current) AND squad_budget=10;
CREATE OR REPLACE FUNCTION public.save_dino_coach_squad(target_manager_id uuid, target_season_id uuid, target_round_id uuid, target_status text, target_budget_dino_dollars bigint, selected_players jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  cfg public.fantasy_dino_settings%ROWTYPE;
  target_squad_id UUID;
  expected_players INTEGER;
  actual_budget BIGINT;
  item_count INTEGER;
  invalid_count INTEGER;
  prior_squad_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(target_manager_id::text || ':' || target_season_id::text,0));
  IF target_status NOT IN ('draft','submitted') OR jsonb_typeof(selected_players) <> 'array' THEN
    RAISE EXCEPTION 'Invalid Dino Coach squad request.' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO cfg FROM public.fantasy_dino_settings WHERE season_id=target_season_id FOR SHARE;
  IF NOT FOUND OR ((NOT cfg.public_launch_enabled OR NOT cfg.team_selection_open) AND coalesce(current_setting('ndcc.dino_admin_edit',true),'')<>'on') THEN
    RAISE EXCEPTION 'Dino Coach team selection is closed.' USING ERRCODE='check_violation';
  END IF;
  IF coalesce(current_setting('ndcc.dino_admin_edit',true),'')<>'on' AND NOT EXISTS (
    SELECT 1 FROM public.fantasy_managers m
    JOIN public.fantasy_entries e ON e.manager_id=m.id AND e.season_id=target_season_id AND (e.status='paid' OR e.is_demo OR e.fee_waived)
    WHERE m.id=target_manager_id AND m.age_verified_at IS NOT NULL
      AND m.team_name_status IN ('approved','replaced') AND m.rules_version_accepted=cfg.rules_version AND m.is_active AND m.deleted_at IS NULL
      AND (m.first_squad_completed_at IS NOT NULL OR now()<m.initial_squad_due_at)
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

  SELECT id INTO prior_squad_id FROM public.fantasy_squads
    WHERE manager_id=target_manager_id AND season_id=target_season_id ORDER BY (round_id IS NOT DISTINCT FROM target_round_id) DESC,created_at DESC LIMIT 1;
  WITH chosen AS (SELECT (item->>'player_id')::UUID player_id FROM jsonb_array_elements(selected_players) item),
  latest AS (
    SELECT DISTINCT ON (p.player_id) p.player_id,COALESCE(owned.purchase_price_dino_dollars,p.price_dino_dollars) AS price_dino_dollars
    FROM public.fantasy_player_prices p JOIN chosen c USING(player_id)
    LEFT JOIN public.fantasy_squad_players owned ON owned.squad_id=prior_squad_id AND owned.player_id=p.player_id
    WHERE p.season_id=target_season_id AND p.published_at IS NOT NULL AND p.price_dino_dollars>0
    ORDER BY p.player_id,p.created_at DESC
  ) SELECT COALESCE(SUM(price_dino_dollars),0),COUNT(*) INTO actual_budget,invalid_count FROM latest;
  IF invalid_count<>item_count THEN RAISE EXCEPTION 'Every selected player needs a positive published price.' USING ERRCODE='check_violation'; END IF;
  IF actual_budget>cfg.budget_dino_dollars OR actual_budget<>target_budget_dino_dollars THEN
    RAISE EXCEPTION 'Dino Coach squad budget or price evidence is invalid.' USING ERRCODE='check_violation';
  END IF;

  SELECT COALESCE(jsonb_agg(item || jsonb_build_object('retained_cost',owned.purchase_price_dino_dollars)),'[]'::jsonb)
    INTO selected_players FROM jsonb_array_elements(selected_players) item
    LEFT JOIN public.fantasy_squad_players owned ON owned.squad_id=prior_squad_id AND owned.player_id=(item->>'player_id')::uuid;
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
    item->>'slot_key',item->>'assigned_role',COALESCE((item->>'retained_cost')::bigint,p.price_dino_dollars)
  FROM jsonb_array_elements(selected_players) item
  JOIN LATERAL (SELECT price_dino_dollars FROM public.fantasy_player_prices
    WHERE season_id=target_season_id AND player_id=(item->>'player_id')::UUID AND published_at IS NOT NULL
    ORDER BY created_at DESC LIMIT 1) p ON TRUE;
  UPDATE public.fantasy_managers SET first_squad_completed_at=CASE WHEN item_count=15 THEN coalesce(first_squad_completed_at,now()) ELSE first_squad_completed_at END, updated_at=now() WHERE id=target_manager_id;
  RETURN target_squad_id;
END; $function$;


-- All mutation functions run with invoker privileges and are server-only.
CREATE OR REPLACE FUNCTION public.dino_market_guard(mid uuid, sid uuid, rid uuid, transfer_only boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r public.fantasy_rounds%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.fantasy_seasons WHERE id=sid AND CASE WHEN is_current THEN team_selection_open ELSE allow_team_building END) THEN
  RAISE EXCEPTION 'Team changes are closed for this season.';
 END IF;
 IF rid IS NOT NULL THEN
  SELECT * INTO r FROM public.fantasy_rounds WHERE id=rid AND season_id=sid;
  IF NOT FOUND OR r.status<>'open' OR (r.deadline_at IS NOT NULL AND r.deadline_at<=now()) THEN RAISE EXCEPTION 'This round is locked.'; END IF;
 END IF;
 IF transfer_only AND NOT public.dino_coach_transfer_window_open(sid,now()) THEN RAISE EXCEPTION 'The transfer window is closed.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fantasy_managers m JOIN public.fantasy_entries e ON e.manager_id=m.id AND e.season_id=sid
  JOIN public.fantasy_dino_settings cfg ON cfg.season_id=sid WHERE m.id=mid AND m.is_active AND m.deleted_at IS NULL
  AND (m.first_squad_completed_at IS NOT NULL OR now()<m.initial_squad_due_at)
  AND (e.status='paid' OR e.is_demo OR e.fee_waived) AND m.age_verified_at IS NOT NULL
  AND m.team_name_status IN ('approved','replaced') AND m.rules_version_accepted=cfg.rules_version
  AND cfg.team_selection_open AND cfg.public_launch_enabled) THEN RAISE EXCEPTION 'Manager eligibility is incomplete.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.save_dino_coach_squad_v2(target_manager_id uuid,target_season_id uuid,target_round_id uuid,target_status text,selected_players jsonb,expected_updated_at timestamptz,expected_budget bigint)
RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE previous public.fantasy_squads%ROWTYPE; total bigint; result uuid; changed boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(target_manager_id::text||':'||target_season_id::text,0));
 SELECT * INTO previous FROM public.fantasy_squads WHERE manager_id=target_manager_id AND season_id=target_season_id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF previous.updated_at IS DISTINCT FROM expected_updated_at THEN RAISE EXCEPTION 'Your squad changed in another session. Reload before saving.'; END IF;
 changed := EXISTS(SELECT 1 FROM public.fantasy_managers WHERE id=target_manager_id AND first_squad_completed_at IS NOT NULL);
 PERFORM public.dino_market_guard(target_manager_id,target_season_id,target_round_id,changed);
 LOCK TABLE public.fantasy_player_prices IN SHARE MODE;
 SELECT COALESCE(sum(COALESCE(owned.purchase_price_dino_dollars,price.price_dino_dollars)),0) INTO total
 FROM jsonb_array_elements(selected_players) item
 LEFT JOIN public.fantasy_squad_players owned ON owned.squad_id=previous.id AND owned.player_id=(item->>'player_id')::uuid
 LEFT JOIN LATERAL (SELECT price_dino_dollars FROM public.fantasy_player_prices WHERE season_id=target_season_id AND player_id=(item->>'player_id')::uuid AND published_at IS NOT NULL ORDER BY created_at DESC LIMIT 1) price ON true;
 IF total IS DISTINCT FROM expected_budget THEN RAISE EXCEPTION 'Player prices changed. Reload before saving.'; END IF;
 result:=public.save_dino_coach_squad(target_manager_id,target_season_id,target_round_id,target_status,total,selected_players);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.dino_market_action(mid uuid,sid uuid,rid uuid,action text,out_id uuid,in_id uuid,slot text,expected_updated_at timestamptz,expected_price bigint)
RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s public.fantasy_squads%ROWTYPE; picks jsonb; replacement jsonb; result uuid; next_status text; total bigint; live_price bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(mid::text||':'||sid::text,0));
 PERFORM public.dino_market_guard(mid,sid,rid,true);
 SELECT * INTO s FROM public.fantasy_squads WHERE manager_id=mid AND season_id=sid ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Build your first squad before using the market.'; END IF;
 IF s.updated_at IS DISTINCT FROM expected_updated_at THEN RAISE EXCEPTION 'Your squad changed. Reload before continuing.'; END IF;
 LOCK TABLE public.fantasy_player_prices IN SHARE MODE;
 IF action IN ('buy','swap') THEN
  SELECT price_dino_dollars INTO live_price FROM public.fantasy_player_prices WHERE season_id=sid AND player_id=in_id AND published_at IS NOT NULL ORDER BY created_at DESC LIMIT 1;
  IF live_price IS NULL OR live_price IS DISTINCT FROM expected_price THEN RAISE EXCEPTION 'Player price changed. Reload before buying.'; END IF;
 END IF;
 IF action NOT IN ('buy','sell','swap') THEN RAISE EXCEPTION 'Unknown market action.'; END IF;
 IF action IN ('sell','swap') AND NOT EXISTS(SELECT 1 FROM public.fantasy_squad_players WHERE squad_id=s.id AND player_id=out_id) THEN RAISE EXCEPTION 'Outgoing player is no longer in your squad.'; END IF;
 IF action IN ('buy','swap') AND (in_id IS NULL OR EXISTS(SELECT 1 FROM public.fantasy_squad_players WHERE squad_id=s.id AND player_id=in_id)) THEN RAISE EXCEPTION 'Choose an eligible player not already in your squad.'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('player_id',player_id,'slot_key',slot_key,'assigned_role',assigned_role,'position_type',position_type,'is_captain',is_captain,'is_vice_captain',is_vice_captain)),'[]'::jsonb)
 INTO picks FROM public.fantasy_squad_players WHERE squad_id=s.id AND (action='buy' OR player_id<>out_id);
 IF action='swap' THEN
  SELECT jsonb_build_object('player_id',in_id,'slot_key',slot_key,'assigned_role',assigned_role,'position_type',position_type,'is_captain',is_captain,'is_vice_captain',is_vice_captain)
  INTO replacement FROM public.fantasy_squad_players WHERE squad_id=s.id AND player_id=out_id;
 ELSIF action='buy' THEN
  replacement:=jsonb_build_object('player_id',in_id,'slot_key',slot,'assigned_role',split_part(slot,'_',2),'position_type',CASE WHEN slot LIKE 'BENCH_%' THEN 'bench' ELSE 'starter' END,'is_captain',false,'is_vice_captain',false);
 END IF;
 IF replacement IS NOT NULL THEN picks:=picks||jsonb_build_array(replacement); END IF;
 next_status:=CASE WHEN action='swap' THEN s.status ELSE 'draft' END;
 SELECT COALESCE(sum(COALESCE(owned.purchase_price_dino_dollars,price.price_dino_dollars)),0) INTO total FROM jsonb_array_elements(picks) item
 LEFT JOIN public.fantasy_squad_players owned ON owned.squad_id=s.id AND owned.player_id=(item->>'player_id')::uuid
 LEFT JOIN LATERAL(SELECT price_dino_dollars FROM public.fantasy_player_prices WHERE season_id=sid AND player_id=(item->>'player_id')::uuid AND published_at IS NOT NULL ORDER BY created_at DESC LIMIT 1) price ON true;
 result:=public.save_dino_coach_squad_v2(mid,sid,rid,next_status,picks,expected_updated_at,total);
 RETURN result;
END $$;

CREATE TABLE public.fantasy_trade_offers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), season_id uuid NOT NULL REFERENCES public.fantasy_seasons(id),
 proposer_id uuid NOT NULL REFERENCES public.fantasy_managers(id), recipient_id uuid NOT NULL REFERENCES public.fantasy_managers(id),
 offered_player_id uuid NOT NULL REFERENCES public.fantasy_players(id), requested_player_id uuid NOT NULL REFERENCES public.fantasy_players(id),
 proposer_version timestamptz NOT NULL, recipient_version timestamptz NOT NULL,
 offered_price bigint NOT NULL CHECK(offered_price>0), requested_price bigint NOT NULL CHECK(requested_price>0),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled','expired')),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days', resolved_at timestamptz,
 CHECK(proposer_id<>recipient_id), CHECK(offered_player_id<>requested_player_id)
);
CREATE INDEX fantasy_trade_offers_participants ON public.fantasy_trade_offers(season_id,recipient_id,status);
ALTER TABLE public.fantasy_trade_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fantasy_trade_offers FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.fantasy_trade_offers TO service_role;
GRANT SELECT ON public.fantasy_trade_offers TO authenticated;
CREATE POLICY trade_participant_read ON public.fantasy_trade_offers FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.fantasy_managers m WHERE m.auth_user_id=(SELECT auth.uid()) AND m.id IN(proposer_id,recipient_id))
);

CREATE OR REPLACE FUNCTION public.dino_trade_action(mid uuid,sid uuid,rid uuid,action text,offer_id uuid DEFAULT NULL,other_id uuid DEFAULT NULL,out_id uuid DEFAULT NULL,in_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE offer public.fantasy_trade_offers%ROWTYPE; a public.fantasy_squads%ROWTYPE; b public.fantasy_squads%ROWTYPE;
 first_id uuid; second_id uuid; op bigint; ip bigint;
BEGIN
 IF action='propose' THEN
  IF other_id IS NULL OR other_id=mid OR out_id IS NULL OR in_id IS NULL OR out_id=in_id THEN RAISE EXCEPTION 'Choose another team and two different players.'; END IF;
  first_id:=least(mid,other_id); second_id:=greatest(mid,other_id);
 ELSE
  SELECT * INTO offer FROM public.fantasy_trade_offers WHERE id=offer_id AND season_id=sid;
  IF NOT FOUND OR mid NOT IN(offer.proposer_id,offer.recipient_id) THEN RAISE EXCEPTION 'Trade not found.'; END IF;
  first_id:=least(offer.proposer_id,offer.recipient_id); second_id:=greatest(offer.proposer_id,offer.recipient_id);
 END IF;
 -- Same ordering for every two-team operation prevents deadlocks.
 PERFORM pg_advisory_xact_lock(hashtextextended(first_id::text||':'||sid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(second_id::text||':'||sid::text,0));
 IF action<>'propose' THEN
  SELECT * INTO offer FROM public.fantasy_trade_offers WHERE id=offer_id FOR UPDATE;
  IF offer.status<>'pending' THEN RAISE EXCEPTION 'This trade has already been resolved.'; END IF;
  IF action='cancel' AND mid=offer.proposer_id OR action='decline' AND mid=offer.recipient_id THEN
   UPDATE public.fantasy_trade_offers SET status=CASE WHEN action='cancel' THEN 'cancelled' ELSE 'declined' END,resolved_at=now() WHERE id=offer.id;
   RETURN offer.id;
  END IF;
  IF action<>'accept' OR mid<>offer.recipient_id THEN RAISE EXCEPTION 'Only the receiving manager can accept this trade.'; END IF;
  IF offer.expires_at<=now() THEN RAISE EXCEPTION 'This trade has expired.'; END IF;
  mid:=offer.proposer_id; other_id:=offer.recipient_id; out_id:=offer.offered_player_id; in_id:=offer.requested_player_id;
 END IF;
 PERFORM public.dino_market_guard(mid,sid,rid,true);
 PERFORM public.dino_market_guard(other_id,sid,rid,true);
 SELECT * INTO a FROM public.fantasy_squads WHERE manager_id=mid AND season_id=sid ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 SELECT * INTO b FROM public.fantasy_squads WHERE manager_id=other_id AND season_id=sid ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF a.id IS NULL OR b.id IS NULL OR a.status<>'submitted' OR b.status<>'submitted' THEN RAISE EXCEPTION 'Both teams need submitted squads.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fantasy_squad_players WHERE squad_id=a.id AND player_id=out_id)
 OR NOT EXISTS(SELECT 1 FROM public.fantasy_squad_players WHERE squad_id=b.id AND player_id=in_id)
 OR EXISTS(SELECT 1 FROM public.fantasy_squad_players WHERE squad_id=a.id AND player_id=in_id OR squad_id=b.id AND player_id=out_id) THEN RAISE EXCEPTION 'Trade would use a missing or duplicate player.'; END IF;
 LOCK TABLE public.fantasy_player_prices IN SHARE MODE;
 SELECT price_dino_dollars INTO op FROM public.fantasy_player_prices WHERE season_id=sid AND player_id=out_id AND published_at IS NOT NULL ORDER BY created_at DESC LIMIT 1;
 SELECT price_dino_dollars INTO ip FROM public.fantasy_player_prices WHERE season_id=sid AND player_id=in_id AND published_at IS NOT NULL ORDER BY created_at DESC LIMIT 1;
 IF op IS NULL OR ip IS NULL OR op<=0 OR ip<=0 THEN RAISE EXCEPTION 'Both players need published prices.'; END IF;
 IF action='propose' THEN
  IF (SELECT count(*) FROM public.fantasy_trade_offers WHERE proposer_id=mid AND season_id=sid AND status='pending' AND expires_at>now())>=20 THEN RAISE EXCEPTION 'Resolve an existing offer before creating another.'; END IF;
  INSERT INTO public.fantasy_trade_offers(season_id,proposer_id,recipient_id,offered_player_id,requested_player_id,proposer_version,recipient_version,offered_price,requested_price)
  VALUES(sid,mid,other_id,out_id,in_id,a.updated_at,b.updated_at,op,ip) RETURNING id INTO offer_id;
  RETURN offer_id;
 END IF;
 IF a.updated_at<>offer.proposer_version OR b.updated_at<>offer.recipient_version OR op<>offer.offered_price OR ip<>offer.requested_price THEN RAISE EXCEPTION 'A squad or price changed. Cancel this offer and create a new one.'; END IF;
 -- Both swaps and the resolution commit together, or all changes roll back.
 PERFORM public.dino_market_action(mid,sid,rid,'swap',out_id,in_id,NULL,a.updated_at,ip);
 PERFORM public.dino_market_action(other_id,sid,rid,'swap',in_id,out_id,NULL,b.updated_at,op);
 UPDATE public.fantasy_trade_offers SET status='accepted',resolved_at=now() WHERE id=offer_id;
 RETURN offer_id;
END $$;

REVOKE ALL ON FUNCTION public.dino_market_guard(uuid,uuid,uuid,boolean),public.save_dino_coach_squad_v2(uuid,uuid,uuid,text,jsonb,timestamptz,bigint),public.dino_market_action(uuid,uuid,uuid,text,uuid,uuid,text,timestamptz,bigint),public.dino_trade_action(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dino_market_guard(uuid,uuid,uuid,boolean),public.save_dino_coach_squad_v2(uuid,uuid,uuid,text,jsonb,timestamptz,bigint),public.dino_market_action(uuid,uuid,uuid,text,uuid,uuid,text,timestamptz,bigint),public.dino_trade_action(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid) TO service_role;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='fantasy_squads') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.fantasy_squads; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='fantasy_trade_offers') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.fantasy_trade_offers; END IF;
 END IF;
END $$;
COMMIT;
-- Rollback: restore the prior application and saved function definition, retaining
-- offers and squad costs for audit. Reconcile squads above 10m before any budget
-- reduction; do not automatically lower the budget after managers have spent it.
