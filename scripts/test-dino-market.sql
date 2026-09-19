-- Run only against an isolated database with the existing migrations and
-- the Dino wallet migration applied. Never run on production.
BEGIN;
DO $$
DECLARE sid uuid; ma uuid; mb uuid; pid uuid; qa uuid; qb uuid; offer uuid; a jsonb:='[]'; b jsonb:='[]'; ids uuid[]:='{}'; i int; av timestamptz; bv timestamptz; before_cost bigint;
 keys text[]:=ARRAY['XI_BAT_1','XI_BAT_2','XI_BAT_3','XI_BAT_4','XI_AR_1','XI_AR_2','XI_WK_1','XI_BOWL_1','XI_BOWL_2','XI_BOWL_3','XI_BOWL_4','BENCH_BAT_1','BENCH_AR_1','BENCH_WK_1','BENCH_BOWL_1'];
 item jsonb;
BEGIN
 INSERT INTO public.fantasy_seasons(name,slug,is_public,auto_sync_enabled,allow_team_building)
 VALUES('Market regression','market-'||gen_random_uuid(),false,false,true) RETURNING id INTO sid;
 INSERT INTO public.fantasy_dino_settings(season_id,pilot_notice,slot_counts,scoring_config,budget_dino_dollars,public_launch_enabled,team_selection_open,rules_version,transfer_open_weekday,transfer_open_minute,transfer_close_weekday,transfer_close_minute)
 VALUES(sid,'Isolated test','{}','{}',15000000,true,true,'test',1,0,7,1439);
 INSERT INTO public.fantasy_managers(display_name,email,team_name,age_verified_at,team_name_status,rules_version_accepted)
 VALUES('Market A',gen_random_uuid()||'@example.invalid','Market A',now(),'approved','test') RETURNING id INTO ma;
 INSERT INTO public.fantasy_managers(display_name,email,team_name,age_verified_at,team_name_status,rules_version_accepted)
 VALUES('Market B',gen_random_uuid()||'@example.invalid','Market B',now(),'approved','test') RETURNING id INTO mb;
 INSERT INTO public.fantasy_entries(manager_id,season_id,status,entry_fee_cents,is_demo,demo_authorisation,demo_granted_at)
 VALUES(ma,sid,'payment_required',2500,true,'Isolated regression',now()),(mb,sid,'payment_required',2500,true,'Isolated regression',now());
 FOR i IN 1..30 LOOP
  INSERT INTO public.fantasy_players(display_name,role) VALUES('Market fixture '||gen_random_uuid(),'BAT') RETURNING id INTO pid;
  ids:=array_append(ids,pid);
  INSERT INTO public.fantasy_season_players(season_id,player_id,role,active,selectable,stats_status) VALUES(sid,pid,'BAT',true,true,'unrated');
  INSERT INTO public.fantasy_player_prices(season_id,player_id,price_dino_dollars,price_million,published_at) VALUES(sid,pid,100000,0.1,now());
  item:=jsonb_build_object('player_id',pid,'slot_key',keys[(i-1)%15+1],'assigned_role',split_part(keys[(i-1)%15+1],'_',2),'position_type',CASE WHEN (i-1)%15<11 THEN 'starter' ELSE 'bench' END,'is_captain',(i-1)%15=0,'is_vice_captain',(i-1)%15=1);
  IF i<=15 THEN a:=a||jsonb_build_array(item);ELSE b:=b||jsonb_build_array(item);END IF;
 END LOOP;
 qa:=public.save_dino_coach_squad_v2(ma,sid,null,'submitted',a,null,1500000);
 qb:=public.save_dino_coach_squad_v2(mb,sid,null,'submitted',b,null,1500000);
 SELECT updated_at INTO av FROM public.fantasy_squads WHERE id=qa;
 SELECT updated_at INTO bv FROM public.fantasy_squads WHERE id=qb;
 -- A price rise must not reprice a retained player or reduce wallet cash.
 UPDATE public.fantasy_player_prices SET price_dino_dollars=200000,price_million=.2 WHERE season_id=sid AND player_id=ids[15];
 PERFORM public.save_dino_coach_squad_v2(ma,sid,null,'submitted',a,av,1500000);
 IF (SELECT budget_used_dino_dollars FROM public.fantasy_squads WHERE id=qa)<>1500000 THEN RAISE EXCEPTION 'Retained cost changed';END IF;
 SELECT updated_at INTO av FROM public.fantasy_squads WHERE id=qa;
 PERFORM public.dino_market_action(ma,sid,null,'sell',ids[15],null,null,av,null);
 IF (SELECT budget_used_dino_dollars FROM public.fantasy_squads WHERE id=qa)<>1400000 THEN RAISE EXCEPTION 'Sale did not refund purchase cost';END IF;
 SELECT updated_at INTO av FROM public.fantasy_squads WHERE id=qa;
 BEGIN
  PERFORM public.dino_market_action(ma,sid,null,'buy',null,ids[15],keys[15],av,100000);
  RAISE EXCEPTION 'Old quoted price accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Old quoted price accepted' THEN RAISE;END IF;END;
 PERFORM public.dino_market_action(ma,sid,null,'buy',null,ids[15],keys[15],av,200000);
 SELECT updated_at INTO av FROM public.fantasy_squads WHERE id=qa;
 PERFORM public.save_dino_coach_squad_v2(ma,sid,null,'submitted',a,av,1600000);
 BEGIN
  PERFORM public.dino_trade_action(ma,sid,null,'propose',null,mb,ids[1],ids[16]);
  RAISE EXCEPTION 'Inter-team trading still enabled';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'Inter-team trades are no longer available. Sell players back to the player pool instead.' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.fantasy_trade_offers WHERE season_id=sid)<>0 THEN RAISE EXCEPTION 'Disabled trade created an offer'; END IF;
 BEGIN
  PERFORM public.save_dino_coach_squad_v2(ma,sid,null,'submitted',a,'2000-01-01',1600000);
  RAISE EXCEPTION 'Stale save accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Stale save accepted' THEN RAISE;END IF;END;
 IF has_function_privilege('authenticated','public.dino_trade_action(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Browser can bypass API authentication';END IF;
 RAISE NOTICE 'PASS market purchases, sales, preserved cost, quote checks, disabled inter-team trading and stale saves';
END $$;
ROLLBACK;
