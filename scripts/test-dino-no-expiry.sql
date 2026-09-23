-- Synthetic fixtures only; every write rolls back, including queued notices.
BEGIN;
SET LOCAL statement_timeout='15s';
DO $$
DECLARE sid uuid; mid uuid; pid uuid; squad uuid; version timestamptz; picks jsonb := '[]'; i integer;
 keys text[]:=ARRAY['XI_BAT_1','XI_BAT_2','XI_BAT_3','XI_BAT_4','XI_AR_1','XI_AR_2','XI_WK_1','XI_BOWL_1','XI_BOWL_2','XI_BOWL_3','XI_BOWL_4','BENCH_BAT_1','BENCH_AR_1','BENCH_WK_1','BENCH_BOWL_1'];
BEGIN
 INSERT INTO public.fantasy_seasons(name,slug,is_public,auto_sync_enabled,allow_team_building)
 VALUES('No-expiry regression','no-expiry-'||gen_random_uuid(),false,false,true) RETURNING id INTO sid;
 INSERT INTO public.fantasy_dino_settings(season_id,pilot_notice,slot_counts,scoring_config,budget_dino_dollars,public_launch_enabled,team_selection_open,rules_version,transfer_open_weekday,transfer_open_minute,transfer_close_weekday,transfer_close_minute)
 VALUES(sid,'Rollback-only test','{}','{}',15000000,true,true,'test-current',1,0,7,1439);
 INSERT INTO public.fantasy_managers(display_name,email,team_name,age_verified_at,team_name_status,rules_version_accepted,initial_squad_due_at)
 VALUES('No-expiry test',gen_random_uuid()||'@example.invalid','No-expiry test',now(),'approved','test-old',now()-interval '30 days') RETURNING id INTO mid;
 INSERT INTO public.fantasy_entries(manager_id,season_id,status,entry_fee_cents,is_demo,demo_authorisation,demo_granted_at)
 VALUES(mid,sid,'payment_required',2500,true,'Rollback-only test',now());
 FOR i IN 1..15 LOOP
  INSERT INTO public.fantasy_players(display_name,role) VALUES('No-expiry fixture '||gen_random_uuid(),'BAT') RETURNING id INTO pid;
  INSERT INTO public.fantasy_season_players(season_id,player_id,role,active,selectable,stats_status) VALUES(sid,pid,'BAT',true,true,'unrated');
  INSERT INTO public.fantasy_player_prices(season_id,player_id,price_dino_dollars,price_million,published_at) VALUES(sid,pid,100000,0.1,now());
  picks:=picks||jsonb_build_array(jsonb_build_object('player_id',pid,'slot_key',keys[i],'assigned_role',split_part(keys[i],'_',2),'position_type',CASE WHEN i<=11 THEN 'starter' ELSE 'bench' END,'is_captain',i=1,'is_vice_captain',i=2));
 END LOOP;
 BEGIN
  PERFORM public.save_dino_coach_squad_v2(mid,sid,null,'draft',picks,null,1500000);
  RAISE EXCEPTION 'FAIL old rules accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Manager eligibility is incomplete.' THEN RAISE; END IF; END;
 UPDATE public.fantasy_managers SET rules_version_accepted='test-current',rules_accepted_at=now() WHERE id=mid;
 squad:=public.save_dino_coach_squad_v2(mid,sid,null,'draft',picks,null,1500000);
 SELECT updated_at INTO version FROM public.fantasy_squads WHERE id=squad;
 PERFORM public.save_dino_coach_squad_v2(mid,sid,null,'submitted',picks,version,1500000);
 IF (SELECT count(*) FROM public.fantasy_squad_players WHERE squad_id=squad)<>15
 OR (SELECT status FROM public.fantasy_squads WHERE id=squad)<>'submitted' THEN RAISE EXCEPTION 'FAIL squad persistence'; END IF;
 IF public.queue_dino_initial_reminders()<>0 THEN RAISE EXCEPTION 'FAIL expiry notices queued'; END IF;
 IF EXISTS(SELECT 1 FROM public.fantasy_notification_jobs WHERE manager_id=mid AND kind IN ('reminder','expired')) THEN RAISE EXCEPTION 'FAIL expiry notice exists'; END IF;
 UPDATE public.fantasy_managers SET is_active=false WHERE id=mid;
 BEGIN
  PERFORM public.save_dino_coach_squad_v2(mid,sid,null,'submitted',picks,version,1500000);
  RAISE EXCEPTION 'FAIL disabled manager saved';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Manager eligibility is incomplete.' THEN RAISE; END IF; END;
 UPDATE public.fantasy_managers SET is_active=true WHERE id=mid;
 UPDATE public.fantasy_entries SET is_demo=false WHERE manager_id=mid;
 BEGIN
  PERFORM public.save_dino_coach_squad_v2(mid,sid,null,'submitted',picks,version,1500000);
  RAISE EXCEPTION 'FAIL unpaid manager saved';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Manager eligibility is incomplete.' THEN RAISE; END IF; END;
END $$;
ROLLBACK;
SELECT 'PASS expired-date draft and submission persist; current consent, manual disable and payment gates enforced; no expiry notifications; all fixtures rolled back' AS result;
