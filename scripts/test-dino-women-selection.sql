-- Isolated disposable database only; test data always rolls back.
BEGIN;
DO $$
DECLARE sid uuid; mid uuid; pid uuid; rid uuid; squad uuid; version timestamptz;
 ids uuid[]:='{}'; picks jsonb:='[]'; i integer;
 keys text[]:=ARRAY['XI_BAT_1','XI_BAT_2','XI_BAT_3','XI_BAT_4','XI_AR_1','XI_AR_2','XI_WK_1','XI_BOWL_1','XI_BOWL_2','XI_BOWL_3','XI_BOWL_4','BENCH_BAT_1','BENCH_AR_1','BENCH_WK_1','BENCH_BOWL_1'];
BEGIN
 INSERT INTO public.fantasy_seasons(name,slug,is_public,auto_sync_enabled,allow_team_building)
 VALUES('Women rule test','women-rule-'||gen_random_uuid(),false,false,true) RETURNING id INTO sid;
 INSERT INTO public.fantasy_dino_settings(season_id,pilot_notice,slot_counts,scoring_config,budget_dino_dollars,public_launch_enabled,team_selection_open,rules_version,women_rule_enabled,transfer_open_weekday,transfer_open_minute,transfer_close_weekday,transfer_close_minute)
 VALUES(sid,'Isolated fixture','{}','{}',15000000,true,true,'test',true,1,0,7,1439);
 INSERT INTO public.fantasy_managers(display_name,email,team_name,age_verified_at,team_name_status,rules_version_accepted)
 VALUES('Women rule fixture',gen_random_uuid()||'@example.invalid','Fixture',now(),'approved','test') RETURNING id INTO mid;
 INSERT INTO public.fantasy_entries(manager_id,season_id,status,entry_fee_cents,is_demo,demo_authorisation,demo_granted_at)
 VALUES(mid,sid,'payment_required',2500,true,'Isolated regression',now());
 INSERT INTO public.fantasy_rounds(season_id,round_number,name,status) VALUES(sid,1,'Fixture round','open') RETURNING id INTO rid;
 FOR i IN 1..16 LOOP
  INSERT INTO public.fantasy_players(display_name,role) VALUES('Rule fixture '||gen_random_uuid(),'BAT') RETURNING id INTO pid;
  ids:=array_append(ids,pid);
  INSERT INTO public.fantasy_season_players(season_id,player_id,role,active,selectable,stats_status,women_eligible)
  VALUES(sid,pid,'BAT',true,true,'unrated',NULL);
  INSERT INTO public.fantasy_player_prices(season_id,player_id,price_dino_dollars,price_million,published_at) VALUES(sid,pid,100000,0.1,now());
  IF i<=15 THEN picks:=picks||jsonb_build_array(jsonb_build_object('player_id',pid,'slot_key',keys[i],'assigned_role',split_part(keys[i],'_',2),'position_type',CASE WHEN i<=11 THEN 'starter' ELSE 'bench' END,'is_captain',i=1,'is_vice_captain',i=2)); END IF;
 END LOOP;
 -- A complete draft may still be below the minimum; submissions may not.
 squad:=public.save_dino_coach_squad(mid,sid,null,'draft',1500000,picks);
 BEGIN
  PERFORM public.save_dino_coach_squad(mid,sid,null,'submitted',1500000,picks);
  RAISE EXCEPTION 'Unreviewed roster was accepted';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'Select at least two women in your 15-player squad.' THEN RAISE; END IF;
 END;
 UPDATE public.fantasy_season_players SET women_eligible=true WHERE season_id=sid AND player_id=ids[12];
 BEGIN
  PERFORM public.save_dino_coach_squad(mid,sid,null,'submitted',1500000,picks);
  RAISE EXCEPTION 'One woman was accepted';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'Select at least two women in your 15-player squad.' THEN RAISE; END IF;
 END;
 UPDATE public.fantasy_season_players SET women_eligible=true WHERE season_id=sid AND player_id=ids[13];
 BEGIN
  PERFORM public.save_dino_coach_squad(mid,sid,null,'submitted',1500000,picks);
  RAISE EXCEPTION 'Two bench women were accepted';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'Select at least one woman in your playing XI.' THEN RAISE; END IF;
 END;
 UPDATE public.fantasy_season_players SET women_eligible=false WHERE season_id=sid AND player_id=ids[13];
 UPDATE public.fantasy_season_players SET women_eligible=true WHERE season_id=sid AND player_id=ids[1];
 squad:=public.save_dino_coach_squad(mid,sid,null,'submitted',1500000,picks);
 SELECT updated_at INTO version FROM public.fantasy_squads WHERE id=squad;
 BEGIN
  PERFORM public.dino_market_action(mid,sid,null,'swap',ids[1],ids[16],null,version,100000);
  RAISE EXCEPTION 'Swap removed the only starting woman';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'Select at least two women in your 15-player squad.' THEN RAISE; END IF;
 END;
 IF (SELECT budget_used_dino_dollars FROM public.fantasy_squads WHERE id=squad)<>1500000 THEN RAISE EXCEPTION 'Rejected swap changed the wallet'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fantasy_squad_players WHERE squad_id=squad AND player_id=ids[1]) THEN RAISE EXCEPTION 'Rejected swap changed the squad'; END IF;
 INSERT INTO public.fantasy_manager_round_scores(manager_id,season_id,round_id,squad_id,total_points,transfer_penalty,net_points)
 VALUES(mid,sid,rid,squad,10,0,10);
 UPDATE public.fantasy_season_players SET women_eligible=false WHERE season_id=sid AND player_id=ids[1];
 BEGIN
  UPDATE public.fantasy_manager_round_scores SET net_points=20 WHERE squad_id=squad;
  RAISE EXCEPTION 'Invalid carried-forward squad scored';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'Select at least two women in your 15-player squad.' THEN RAISE; END IF;
 END;
 UPDATE public.fantasy_dino_settings SET women_rule_enabled=false WHERE season_id=sid;
 PERFORM public.save_dino_coach_squad(mid,sid,null,'submitted',1500000,picks);
 IF has_function_privilege('authenticated','public.validate_dino_women_selection(uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Browser role has validation RPC access'; END IF;
 RAISE NOTICE 'PASS women rule: drafts, one/two women, bench/starter, swap rollback, scoring, disabled seasons and privileges';
END;
$$;
ROLLBACK;
