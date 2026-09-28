-- Run in an isolated database or an explicit transaction; all fixtures roll back.
BEGIN;
DO $$
DECLARE sid uuid; pid uuid; rid uuid; bid uuid; result jsonb; value bigint;
BEGIN
 INSERT INTO public.fantasy_seasons(name,slug,is_public,auto_sync_enabled) VALUES('Pricing regression','pricing-regression-'||gen_random_uuid(),false,false) RETURNING id INTO sid;
 INSERT INTO public.fantasy_dino_settings(season_id,pilot_notice,slot_counts,scoring_config,budget_dino_dollars,initial_price_floor_dino_dollars,initial_price_ceiling_dino_dollars,price_changes_start_round,price_point_value_dino_dollars)
 VALUES(sid,'Regression fixture','{}','{}',10000000,100000,2000000,2,10000);
 INSERT INTO public.fantasy_players(display_name,role) VALUES('Pricing fixture '||gen_random_uuid(),'BAT') RETURNING id INTO pid;
 INSERT INTO public.fantasy_season_players(season_id,player_id,role,active,selectable,stats_status) VALUES(sid,pid,'BAT',true,true,'unrated');
 INSERT INTO public.fantasy_player_prices(season_id,player_id,price_dino_dollars,price_million,prior_baseline_points,rolling_performance_points,published_at,created_at)
 VALUES(sid,pid,500000,0.5,20,20,now(),now()-interval '1 day');
 INSERT INTO public.fantasy_rounds(season_id,round_number,name,deadline_at,status) VALUES(sid,2,'Round 2',now()-interval '30 days','scored') RETURNING id INTO rid;
 INSERT INTO public.fantasy_import_batches(season_id,status) VALUES(sid,'draft') RETURNING id INTO bid;
 INSERT INTO public.fantasy_match_stats(season_id,round_id,player_id,import_batch_id,match_date,runs) VALUES(sid,rid,pid,bid,current_date-30,60);
 result:=public.settle_dino_price_windows(sid);
 IF (result->>'windows')::int<>0 THEN RAISE EXCEPTION 'Draft results changed prices'; END IF;
 UPDATE public.fantasy_import_batches SET status='published' WHERE id=bid;
 result:=public.settle_dino_price_windows(sid);
 IF (result->>'windows')::int<>1 THEN RAISE EXCEPTION 'Even round did not settle'; END IF;
 SELECT price_dino_dollars INTO value FROM public.fantasy_player_prices WHERE season_id=sid AND effective_round_id=rid;
 IF value<>650000 THEN RAISE EXCEPTION 'Expected increase to 650000, got %',value; END IF;
 result:=public.settle_dino_price_windows(sid);
 IF (result->>'windows')::int<>0 THEN RAISE EXCEPTION 'Duplicate settlement'; END IF;
 PERFORM public.override_dino_player_price(sid,pid,700123,'Regression override','fixture');
 SELECT price_dino_dollars INTO value FROM public.fantasy_player_prices WHERE season_id=sid AND effective_round_id=rid;
 IF value<>701000 THEN RAISE EXCEPTION 'Manual price not rounded upwards'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fantasy_manual_price_audit WHERE season_id=sid AND new_price=701000 AND old_price=650000) THEN RAISE EXCEPTION 'Missing audit'; END IF;
 INSERT INTO public.fantasy_rounds(season_id,round_number,name,deadline_at,status) VALUES(sid,3,'Round 3',now()-interval '23 days','scored') RETURNING id INTO rid;
 INSERT INTO public.fantasy_match_stats(season_id,round_id,player_id,import_batch_id,match_date,runs) VALUES(sid,rid,pid,bid,current_date-23,0);
 result:=public.settle_dino_price_windows(sid);
 IF (result->>'windows')::int<>0 THEN RAISE EXCEPTION 'Odd round settled'; END IF;
 INSERT INTO public.fantasy_rounds(season_id,round_number,name,deadline_at,status) VALUES(sid,4,'Round 4',now()-interval '16 days','scored') RETURNING id INTO rid;
 INSERT INTO public.fantasy_match_stats(season_id,round_id,player_id,import_batch_id,match_date,runs) VALUES(sid,rid,pid,bid,current_date-16,0);
 PERFORM public.settle_dino_price_windows(sid);
 SELECT price_dino_dollars INTO value FROM public.fantasy_player_prices WHERE season_id=sid AND effective_round_id=rid;
 IF value<>451000 THEN RAISE EXCEPTION 'Expected decrease from manual price to 451000, got %',value; END IF;
 INSERT INTO public.fantasy_rounds(season_id,round_number,name,deadline_at,status,round_kind,pricing_eligible) VALUES(sid,10,'Grand final',now()-interval '9 days','scored','grand_final',false) RETURNING id INTO rid;
 INSERT INTO public.fantasy_match_stats(season_id,round_id,player_id,import_batch_id,match_date,runs) VALUES(sid,rid,pid,bid,current_date-9,500);
 result:=public.settle_dino_price_windows(sid);
 IF (result->>'windows')::int<>0 THEN RAISE EXCEPTION 'Final changed prices'; END IF;
 INSERT INTO public.fantasy_rounds(season_id,round_number,name,deadline_at,status) VALUES(sid,8,'Future round',now()+interval '10 days','open') RETURNING id INTO rid;
 INSERT INTO public.fantasy_match_stats(season_id,round_id,player_id,import_batch_id,match_date,runs) VALUES(sid,rid,pid,bid,current_date+10,50);
 result:=public.settle_dino_price_windows(sid);
 IF (result->>'windows')::int<>0 THEN RAISE EXCEPTION 'Price changed before cut-off'; END IF;
 INSERT INTO public.fantasy_rounds(season_id,round_number,name,deadline_at,status) VALUES(sid,5,'Round 5',now()-interval '10 days','scored') RETURNING id INTO rid;
 INSERT INTO public.fantasy_match_stats(season_id,round_id,player_id,import_batch_id,match_date,runs) VALUES(sid,rid,pid,bid,current_date-10,0);
 INSERT INTO public.fantasy_rounds(season_id,round_number,name,deadline_at,status) VALUES(sid,6,'Round 6',now()-interval '9 days','scored') RETURNING id INTO rid;
 INSERT INTO public.fantasy_match_stats(season_id,round_id,player_id,import_batch_id,match_date,runs) VALUES(sid,rid,pid,bid,current_date-9,0);
 INSERT INTO public.fantasy_match_stats(season_id,round_id,player_id,import_batch_id,match_date,runs) SELECT sid,id,pid,bid,current_date-30,100 FROM public.fantasy_rounds WHERE season_id=sid AND round_number=2;
 PERFORM public.settle_dino_price_windows(sid);
 SELECT price_dino_dollars INTO value FROM public.fantasy_player_prices WHERE season_id=sid AND effective_round_id=rid;
 IF value<>701000 THEN RAISE EXCEPTION 'Late result was dropped; expected 701000, got %',value; END IF;
 IF (SELECT count(*) FROM public.fantasy_priced_appearances WHERE season_id=sid)<>6 THEN RAISE EXCEPTION 'Each eligible appearance must be consumed'; END IF;
 PERFORM public.override_dino_player_price(sid,pid,700123,'','fixture');
 BEGIN PERFORM public.override_dino_player_price(sid,pid,710123,'','fixture'); RAISE EXCEPTION 'Blank reason accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Blank reason accepted' THEN RAISE; END IF; END;
 UPDATE public.fantasy_season_players SET eligibility_exclusion='U13',selectable=true WHERE season_id=sid;
 UPDATE public.fantasy_season_players SET selectable=true WHERE season_id=sid;
 IF EXISTS(SELECT 1 FROM public.fantasy_season_players WHERE season_id=sid AND selectable) THEN RAISE EXCEPTION 'Sync reactivated excluded player'; END IF;
 BEGIN PERFORM public.override_dino_player_price(sid,pid,1,'Invalid floor','fixture'); RAISE EXCEPTION 'Invalid price accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Invalid price accepted' THEN RAISE; END IF; END;
 IF has_function_privilege('anon','public.settle_dino_price_windows(uuid)','EXECUTE') OR has_function_privilege('authenticated','public.override_dino_player_price(uuid,uuid,bigint,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Browser pricing access'; END IF;
END $$;
DO $$
DECLARE sid uuid; pid uuid; rid uuid; bid uuid; value bigint;
BEGIN
 INSERT INTO public.fantasy_seasons(name,slug,is_public,auto_sync_enabled) VALUES('Rounding regression','rounding-regression-'||gen_random_uuid(),false,false) RETURNING id INTO sid;
 INSERT INTO public.fantasy_dino_settings(season_id,pilot_notice,slot_counts,scoring_config,budget_dino_dollars,initial_price_floor_dino_dollars,initial_price_ceiling_dino_dollars,price_changes_start_round,price_point_value_dino_dollars)
 VALUES(sid,'Regression fixture','{}','{}',10000000,100000,2000000,2,10000);
 INSERT INTO public.fantasy_players(display_name,role) VALUES('Rounding fixture '||gen_random_uuid(),'BAT') RETURNING id INTO pid;
 INSERT INTO public.fantasy_season_players(season_id,player_id,role,active,selectable,stats_status) VALUES(sid,pid,'BAT',true,true,'unrated');
 INSERT INTO public.fantasy_player_prices(season_id,player_id,price_dino_dollars,price_million,prior_baseline_points,rolling_performance_points,published_at,created_at)
 VALUES(sid,pid,500000,0.5,0,0,now(),now()-interval '1 day');
 INSERT INTO public.fantasy_rounds(season_id,round_number,name,deadline_at,status) VALUES(sid,2,'Round 2',now()-interval '30 days','scored') RETURNING id INTO rid;
 INSERT INTO public.fantasy_import_batches(season_id,status) VALUES(sid,'published') RETURNING id INTO bid;
 INSERT INTO public.fantasy_match_stats(season_id,round_id,player_id,import_batch_id,match_date,runs) VALUES(sid,rid,pid,bid,current_date-30,1);
 PERFORM public.settle_dino_price_windows(sid);
 SELECT price_dino_dollars INTO value FROM public.fantasy_player_prices WHERE season_id=sid AND effective_round_id=rid;
 IF value<>503000 THEN RAISE EXCEPTION '502500 must round upwards to 503000, got %',value; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fantasy_price_calculations WHERE season_id=sid AND new_price_dino_dollars=503000 AND price_change_dino_dollars=3000) THEN RAISE EXCEPTION 'Rounded price audit is inconsistent'; END IF;
END $$;
-- Later-starting grades have no invented zero appearances or price reduction.
DO $$
DECLARE sid uuid; early_id uuid; late_id uuid; rid uuid; bid uuid; p uuid;
BEGIN
 INSERT INTO public.fantasy_seasons(name,slug,is_public,auto_sync_enabled)
 VALUES('Later start pricing','later-start-'||gen_random_uuid(),false,false) RETURNING id INTO sid;
 INSERT INTO public.fantasy_dino_settings(season_id,pilot_notice,slot_counts,scoring_config,budget_dino_dollars,initial_price_floor_dino_dollars,initial_price_ceiling_dino_dollars,price_changes_start_round,price_point_value_dino_dollars)
 VALUES(sid,'Isolated later-start fixture','{}','{}',15000000,100000,2000000,2,10000);
 INSERT INTO public.fantasy_players(display_name,role) VALUES('Early grade '||gen_random_uuid(),'BAT') RETURNING id INTO early_id;
 INSERT INTO public.fantasy_players(display_name,role) VALUES('Later grade '||gen_random_uuid(),'BAT') RETURNING id INTO late_id;
 FOREACH p IN ARRAY ARRAY[early_id,late_id] LOOP
  INSERT INTO public.fantasy_season_players(season_id,player_id,role,active,selectable,stats_status)
  VALUES(sid,p,'BAT',true,true,'unrated');
  INSERT INTO public.fantasy_player_prices(season_id,player_id,price_dino_dollars,price_million,prior_baseline_points,rolling_performance_points,published_at,created_at)
  VALUES(sid,p,500000,0.5,20,20,now(),now()-interval '1 day');
 END LOOP;
 INSERT INTO public.fantasy_import_batches(season_id,status) VALUES(sid,'published') RETURNING id INTO bid;
 INSERT INTO public.fantasy_rounds(season_id,round_number,name,deadline_at,status)
 VALUES(sid,2,'Before later grade starts',now()-interval '30 days','scored') RETURNING id INTO rid;
 INSERT INTO public.fantasy_match_stats(season_id,round_id,player_id,import_batch_id,match_date,runs)
 VALUES(sid,rid,early_id,bid,current_date-30,60);
 PERFORM public.settle_dino_price_windows(sid);
 IF NOT EXISTS(SELECT 1 FROM public.fantasy_player_prices WHERE season_id=sid AND player_id=late_id AND effective_round_id=rid AND price_dino_dollars=500000 AND rolling_performance_points=20 AND price_change_dino_dollars=0) THEN
  RAISE EXCEPTION 'A later-starting player lost price or performance average without an appearance';
 END IF;
 IF EXISTS(SELECT 1 FROM public.fantasy_price_calculations WHERE season_id=sid AND player_id=late_id AND cardinality(recent_points)>0) THEN
  RAISE EXCEPTION 'An unplayed week was counted as an appearance';
 END IF;
 INSERT INTO public.fantasy_rounds(season_id,round_number,name,deadline_at,status)
 VALUES(sid,4,'Later grade first appearance',now()-interval '16 days','scored') RETURNING id INTO rid;
 INSERT INTO public.fantasy_match_stats(season_id,round_id,player_id,import_batch_id,match_date,runs)
 VALUES(sid,rid,late_id,bid,current_date-16,60);
 PERFORM public.settle_dino_price_windows(sid);
 IF NOT EXISTS(SELECT 1 FROM public.fantasy_player_prices WHERE season_id=sid AND player_id=late_id AND effective_round_id=rid AND price_dino_dollars=650000 AND rolling_performance_points=35) THEN
  RAISE EXCEPTION 'First real appearance was diluted by earlier unplayed weeks';
 END IF;
END $$;
DO $$
-- Saj's rule: prices change after every second round from a rolling average, and
-- the round 4 review measures the change from the round 2 rolling figure.
DECLARE sid uuid; pid uuid; r uuid[]:='{}'; bid uuid; rid uuid; value bigint; prev numeric; rolling numeric; i int; pts int[]:=ARRAY[40,48,12,16];
BEGIN
 INSERT INTO public.fantasy_seasons(name,slug,is_public,auto_sync_enabled) VALUES('Rolling regression','rolling-regression-'||gen_random_uuid(),false,false) RETURNING id INTO sid;
 INSERT INTO public.fantasy_dino_settings(season_id,pilot_notice,slot_counts,scoring_config,budget_dino_dollars,initial_price_floor_dino_dollars,initial_price_ceiling_dino_dollars,price_changes_start_round,price_point_value_dino_dollars)
 VALUES(sid,'Regression fixture','{}','{}',15000000,100000,2000000,2,10000);
 INSERT INTO public.fantasy_players(display_name,role) VALUES('Rolling fixture '||gen_random_uuid(),'BAT') RETURNING id INTO pid;
 INSERT INTO public.fantasy_season_players(season_id,player_id,role,active,selectable,stats_status) VALUES(sid,pid,'BAT',true,true,'unrated');
 INSERT INTO public.fantasy_player_prices(season_id,player_id,price_dino_dollars,price_million,prior_baseline_points,rolling_performance_points,published_at,created_at)
 VALUES(sid,pid,500000,0.5,30,30,now(),now()-interval '60 days');
 INSERT INTO public.fantasy_import_batches(season_id,status) VALUES(sid,'published') RETURNING id INTO bid;
 FOR i IN 1..4 LOOP
  INSERT INTO public.fantasy_rounds(season_id,round_number,name,deadline_at,status) VALUES(sid,i,'Round '||i,now()-make_interval(days=>50-7*i),'scored') RETURNING id INTO rid;
  r:=array_append(r,rid);
  INSERT INTO public.fantasy_match_stats(season_id,round_id,player_id,import_batch_id,match_date,runs) VALUES(sid,rid,pid,bid,current_date-(50-7*i),pts[i]);
 END LOOP;
 PERFORM public.settle_dino_price_windows(sid);
 -- Round 2 (runs below 50, so no batting bonus): games 40 and 48 average 44; rolling 0.5 x 30 + 0.5 x 44 = 37; +7 x 10,000.
 SELECT price_dino_dollars,previous_rolling_performance_points,rolling_performance_points INTO value,prev,rolling FROM public.fantasy_player_prices WHERE season_id=sid AND effective_round_id=r[2];
 IF value<>570000 OR prev<>30 OR rolling<>37 THEN RAISE EXCEPTION 'Round 2 review wrong: price %, previous %, rolling %',value,prev,rolling; END IF;
 -- Round 4: games 12 and 16 average 14; rolling 0.5 x 30 + 0.5 x 14 = 22; measured from round 2's 37: -15 x 10,000.
 SELECT price_dino_dollars,previous_rolling_performance_points,rolling_performance_points INTO value,prev,rolling FROM public.fantasy_player_prices WHERE season_id=sid AND effective_round_id=r[4];
 IF value<>420000 OR prev<>37 OR rolling<>22 THEN RAISE EXCEPTION 'Round 4 review wrong: price %, previous %, rolling %',value,prev,rolling; END IF;
 IF EXISTS(SELECT 1 FROM public.fantasy_player_prices WHERE season_id=sid AND effective_round_id IN (r[1],r[3])) THEN RAISE EXCEPTION 'Odd round changed a price'; END IF;
END $$;
ROLLBACK;
