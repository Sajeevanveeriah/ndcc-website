-- Isolated CI fixtures only: no live payment, email or team is created.
BEGIN;
DO $$
DECLARE sid uuid; ma uuid; mb uuid; pa uuid; qa uuid; qb uuid; again uuid;
  picks jsonb := '[]'; reverse_picks jsonb := '[]'; item jsonb; i int; n int;
  keys text[] := ARRAY['XI_BAT_1','XI_BAT_2','XI_BAT_3','XI_BAT_4','XI_AR_1','XI_AR_2','XI_WK_1','XI_BOWL_1','XI_BOWL_2','XI_BOWL_3','XI_BOWL_4','BENCH_BAT_1','BENCH_AR_1','BENCH_WK_1','BENCH_BOWL_1'];
BEGIN
 INSERT INTO public.fantasy_seasons(name,slug,is_public,auto_sync_enabled)
 VALUES('Two-team regression','two-team-'||gen_random_uuid(),false,false) RETURNING id INTO sid;
 INSERT INTO public.fantasy_dino_settings(season_id,pilot_notice,slot_counts,scoring_config,budget_dino_dollars,public_launch_enabled,team_selection_open,rules_version)
 VALUES(sid,'Isolated regression','{}','{}',10000000,true,true,'test');
 INSERT INTO public.fantasy_managers(display_name,email,team_name,age_verified_at,team_name_status,rules_version_accepted)
 VALUES('Test A',gen_random_uuid()||'@example.invalid','Test A',now(),'approved','test') RETURNING id INTO ma;
 INSERT INTO public.fantasy_managers(display_name,email,team_name,age_verified_at,team_name_status,rules_version_accepted)
 VALUES('Test B',gen_random_uuid()||'@example.invalid','Test B',now(),'approved','test') RETURNING id INTO mb;
 INSERT INTO public.fantasy_entries(manager_id,season_id,status,entry_fee_cents) VALUES(ma,sid,'payment_required',2500),(mb,sid,'payment_required',2500);
 FOR i IN 1..15 LOOP
  INSERT INTO public.fantasy_players(display_name,role) VALUES('Two-team fixture '||gen_random_uuid(),'BAT') RETURNING id INTO pa;
  INSERT INTO public.fantasy_season_players(season_id,player_id,role,active,selectable,stats_status) VALUES(sid,pa,'BAT',true,true,'unrated');
  INSERT INTO public.fantasy_player_prices(season_id,player_id,price_dino_dollars,price_million,published_at) VALUES(sid,pa,100000,0.1,now());
  picks:=picks||jsonb_build_array(jsonb_build_object('player_id',pa,'slot_key',keys[i],'assigned_role',split_part(keys[i],'_',2),'position_type',case when i<=11 then 'starter' else 'bench' end,'is_captain',i=1,'is_vice_captain',i=2));
 END LOOP;
 BEGIN
  PERFORM public.save_dino_coach_squad(ma,sid,null,'submitted',1500000,picks);
  RAISE EXCEPTION 'Unpaid squad accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 -- An explicit administrator demo grant unlocks saving without money or receipts.
 UPDATE public.fantasy_entries SET is_demo=true, demo_authorisation='Isolated test grant', demo_granted_at=now() WHERE manager_id=ma AND season_id=sid;
 qa:=public.save_dino_coach_squad(ma,sid,null,'submitted',1500000,picks);
 IF (SELECT count(*) FROM public.fantasy_squad_players WHERE squad_id=qa)<>15 THEN RAISE EXCEPTION 'Demo squad did not save'; END IF;
 IF EXISTS(SELECT 1 FROM public.fantasy_entries WHERE season_id=sid AND (status='paid' OR paid_at IS NOT NULL)) THEN RAISE EXCEPTION 'Demo grant fabricated payment'; END IF;
 IF EXISTS(SELECT 1 FROM public.receipt_delivery_jobs j JOIN public.fantasy_entries e ON e.id=j.dino_entry_id WHERE e.season_id=sid) THEN RAISE EXCEPTION 'Demo grant queued payment receipts'; END IF;
 BEGIN PERFORM public.save_dino_coach_squad(mb,sid,null,'submitted',1500000,picks); RAISE EXCEPTION 'Demo grant leaked to another manager'; EXCEPTION WHEN check_violation THEN NULL; END;
 IF has_column_privilege('authenticated','public.fantasy_entries','is_demo','UPDATE') OR has_table_privilege('authenticated','public.fantasy_entries','INSERT') THEN RAISE EXCEPTION 'Browser can grant free access'; END IF;
 UPDATE public.fantasy_entries SET is_demo=false WHERE manager_id=ma AND season_id=sid;
 BEGIN PERFORM public.save_dino_coach_squad(ma,sid,null,'submitted',1500000,picks); RAISE EXCEPTION 'Revoked demo access still works'; EXCEPTION WHEN check_violation THEN NULL; END;
 DELETE FROM public.fantasy_squads WHERE id=qa;
 -- Payment eligibility is simulated only inside this rollback-only CI database.
 PERFORM public.ensure_fantasy_entry_payment_reference(id) FROM public.fantasy_entries WHERE season_id=sid;
 UPDATE public.fantasy_entries SET status='paid',paid_at=now(),stripe_payment_intent_id='pi_test_'||replace(id::text,'-','') WHERE season_id=sid;
 IF (SELECT count(*) FROM public.receipt_delivery_jobs j JOIN public.fantasy_entries e ON e.id=j.dino_entry_id WHERE e.season_id=sid)<>2 THEN RAISE EXCEPTION 'Each paid fixture must queue its own receipt'; END IF;
 IF (SELECT count(*) FROM public.fantasy_registration_emails j JOIN public.fantasy_entries e ON e.id=j.entry_id WHERE e.season_id=sid)<>2 THEN RAISE EXCEPTION 'Each registration needs its own email job'; END IF;
 FOR i IN 0..14 LOOP
  item:=picks->i;
  item:=jsonb_set(item,'{player_id}',picks->(14-i)->'player_id');
  reverse_picks:=reverse_picks||jsonb_build_array(item);
 END LOOP;
 qa:=public.save_dino_coach_squad(ma,sid,null,'submitted',1500000,picks);
 qb:=public.save_dino_coach_squad(mb,sid,null,'submitted',1500000,reverse_picks);
 IF qa=qb THEN RAISE EXCEPTION 'Managers share squad identity'; END IF;
 SELECT count(*) INTO n FROM public.fantasy_squad_players WHERE squad_id IN(qa,qb);
 IF n<>30 THEN RAISE EXCEPTION 'Expected two complete squads'; END IF;
 IF (SELECT player_id FROM public.fantasy_squad_players WHERE squad_id=qa AND is_captain)=(SELECT player_id FROM public.fantasy_squad_players WHERE squad_id=qb AND is_captain) THEN RAISE EXCEPTION 'Captains were conflated'; END IF;
 again:=public.save_dino_coach_squad(ma,sid,null,'submitted',1500000,reverse_picks);
 IF again<>qa OR (SELECT count(*) FROM public.fantasy_squads WHERE season_id=sid)<>2 THEN RAISE EXCEPTION 'Repeat save duplicated a squad'; END IF;
 IF (SELECT count(*) FROM public.fantasy_squad_players WHERE squad_id=qb)<>15 OR (SELECT player_id::text FROM public.fantasy_squad_players WHERE squad_id=qb AND is_captain) IS DISTINCT FROM (reverse_picks->0->>'player_id') THEN RAISE EXCEPTION 'Saving A changed B'; END IF;
 BEGIN PERFORM public.save_dino_coach_squad(ma,sid,null,'submitted',1,picks); RAISE EXCEPTION 'Forged budget accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN PERFORM public.save_dino_coach_squad(ma,sid,null,'submitted',1500000,jsonb_set(picks,'{0,is_vice_captain}','true')); RAISE EXCEPTION 'Duplicate captain accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 UPDATE public.fantasy_dino_settings SET budget_dino_dollars=1000000 WHERE season_id=sid;
 BEGIN PERFORM public.save_dino_coach_squad(ma,sid,null,'submitted',1500000,picks); RAISE EXCEPTION 'Over-budget squad accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 IF has_function_privilege('authenticated','public.save_dino_coach_squad(uuid,uuid,uuid,text,bigint,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Browser can bypass manager API'; END IF;
END $$;
ROLLBACK;
