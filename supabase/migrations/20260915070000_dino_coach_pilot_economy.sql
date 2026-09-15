-- Pilot economy. Opening-data updates abort if a manager has started a squad.
ALTER TABLE public.fantasy_dino_settings ADD COLUMN price_change_interval_rounds integer NOT NULL DEFAULT 2 CHECK (price_change_interval_rounds >= 1);
ALTER TABLE public.fantasy_season_players ADD COLUMN eligibility_exclusion text;
ALTER TABLE public.fantasy_player_prices ALTER COLUMN price_million TYPE numeric(12,6);
CREATE TABLE public.fantasy_price_windows (
 season_id uuid NOT NULL REFERENCES public.fantasy_seasons(id), round_id uuid NOT NULL REFERENCES public.fantasy_rounds(id),
 settled_at timestamptz NOT NULL DEFAULT now(), player_count integer NOT NULL, PRIMARY KEY(season_id,round_id)
);
ALTER TABLE public.fantasy_price_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fantasy_price_windows FROM PUBLIC,anon,authenticated;
CREATE TABLE public.fantasy_manual_price_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), season_id uuid NOT NULL REFERENCES public.fantasy_seasons(id),
 player_id uuid NOT NULL REFERENCES public.fantasy_players(id), old_price bigint, new_price bigint NOT NULL,
 reason text NOT NULL, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fantasy_manual_price_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fantasy_manual_price_audit FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.enforce_dino_eligibility() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN IF NEW.eligibility_exclusion IS NOT NULL THEN NEW.selectable:=false; END IF; RETURN NEW; END $$;
CREATE TRIGGER enforce_dino_eligibility BEFORE INSERT OR UPDATE ON public.fantasy_season_players FOR EACH ROW EXECUTE FUNCTION public.enforce_dino_eligibility();
DO $$
DECLARE sid uuid;
BEGIN
 SELECT id INTO sid FROM public.fantasy_seasons WHERE slug='2026-27';
 IF sid IS NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.fantasy_squads WHERE season_id=sid) OR EXISTS(SELECT 1 FROM public.fantasy_entries WHERE season_id=sid AND status='paid') THEN
 RAISE EXCEPTION 'Pilot economy requires review of existing entries and squads'; END IF;
 UPDATE public.fantasy_dino_settings SET budget_dino_dollars=10000000,round_robin_prize_dino_dollars=300,
 initial_price_floor_dino_dollars=100000,price_changes_start_round=2,price_change_interval_rounds=2,rules_version='2026-27-rev04',updated_at=now() WHERE season_id=sid;
 UPDATE public.fantasy_settings SET squad_budget=10,updated_at=now() WHERE season_id=sid;
 UPDATE public.fantasy_season_players sp SET selectable=false,eligibility_exclusion='U13 in supplied 2025/2026 workbook',updated_at=now()
 FROM public.fantasy_players p WHERE p.id=sp.player_id AND sp.season_id=sid AND p.display_name IN (
 'Shayaan Abdullah','Kieran Anderton','Aidan Chand','Ollie Coombs','Liam Cox','Archie Hayes','Craig Moorfoot','Maverick Quinn','Blake Reed','Lucas Rickards','Rehan Shaikh','Angus Welling');
 INSERT INTO public.fantasy_manual_price_audit(season_id,player_id,old_price,new_price,reason,actor)
 SELECT sid,player_id,price_dino_dollars,100000,'Pilot no-stat opening price approved by Saj','release:2026-27-rev04' FROM public.fantasy_player_prices WHERE season_id=sid AND effective_round_id IS NULL AND source_status='unrated' AND price_dino_dollars=500000;
 UPDATE public.fantasy_player_prices SET price_dino_dollars=100000,price_million=0.1,
 calculation=calculation || '{"pilot_no_stats_price":100000}'::jsonb WHERE season_id=sid AND effective_round_id IS NULL AND source_status='unrated' AND price_dino_dollars=500000;
END $$;

-- The published-results cut-off is Monday 09:00 Melbourne after each two-round window.
-- Settlements are atomic/idempotent; late results enter the next window. Finals are excluded.
CREATE FUNCTION public.settle_dino_price_windows(target_season_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg public.fantasy_dino_settings%ROWTYPE; r record; p record; old public.fantasy_player_prices%ROWTYPE;
 recent numeric[]; baseline numeric; rolling numeric; next_price bigint; changed integer:=0; windows integer:=0; evidence jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('dino-prices:'||target_season_id::text,0));
 SELECT * INTO STRICT cfg FROM public.fantasy_dino_settings WHERE season_id=target_season_id;
 FOR r IN SELECT * FROM public.fantasy_rounds fr WHERE fr.season_id=target_season_id AND fr.pricing_eligible AND fr.round_kind='regular'
 AND fr.round_number>=cfg.price_changes_start_round AND (fr.round_number-cfg.price_changes_start_round)%cfg.price_change_interval_rounds=0
 AND fr.deadline_at IS NOT NULL AND now() >= ((date_trunc('week',fr.deadline_at AT TIME ZONE 'Australia/Melbourne')+interval '7 days 9 hours') AT TIME ZONE 'Australia/Melbourne')
 AND NOT EXISTS(SELECT 1 FROM public.fantasy_price_windows w WHERE w.season_id=target_season_id AND w.round_id=fr.id)
 AND NOT EXISTS(SELECT 1 FROM public.fantasy_price_windows w JOIN public.fantasy_rounds wr ON wr.id=w.round_id WHERE w.season_id=target_season_id AND wr.round_number>fr.round_number)
 AND EXISTS(SELECT 1 FROM public.fantasy_match_stats ms JOIN public.fantasy_import_batches b ON b.id=ms.import_batch_id WHERE ms.round_id=fr.id AND b.status='published')
 ORDER BY fr.round_number LOOP
 changed:=0;
 FOR p IN SELECT * FROM public.fantasy_season_players WHERE season_id=target_season_id AND active AND selectable LOOP
 SELECT * INTO old FROM public.fantasy_player_prices fp WHERE fp.season_id=target_season_id AND fp.player_id=p.player_id AND fp.published_at IS NOT NULL ORDER BY fp.created_at DESC,fp.id DESC LIMIT 1;
 IF old.id IS NULL THEN RAISE EXCEPTION 'Published price missing for %',p.player_id; END IF;
 baseline:=coalesce(old.prior_baseline_points,p.prior_average_points,0);
 SELECT array_agg(points ORDER BY match_date DESC,id DESC) INTO recent FROM (
 SELECT ms.id,ms.match_date,
 ms.runs*coalesce((cfg.scoring_config->>'runPoints')::numeric,1)+ms.wickets*coalesce((cfg.scoring_config->>'wicketPoints')::numeric,10)+
 ms.catches*coalesce((cfg.scoring_config->>'catchPoints')::numeric,10)+ms.runouts*coalesce((cfg.scoring_config->>'runoutPoints')::numeric,10)+
 ms.maidens*coalesce((cfg.scoring_config->>'maidenPoints')::numeric,5)+ms.stumpings*coalesce((cfg.scoring_config->>'stumpingPoints')::numeric,10)+
 CASE WHEN ms.not_out THEN coalesce((cfg.scoring_config->>'notOutPoints')::numeric,10) ELSE 0 END+
 CASE WHEN ms.runs>=100 THEN coalesce((cfg.scoring_config->>'centuryBonus')::numeric,50) WHEN ms.runs>=50 THEN coalesce((cfg.scoring_config->>'fiftyBonus')::numeric,20) ELSE 0 END+
 CASE WHEN ms.wickets>=7 THEN coalesce((cfg.scoring_config->>'sevenWicketBonus')::numeric,50) WHEN ms.wickets>=5 THEN coalesce((cfg.scoring_config->>'fiveWicketBonus')::numeric,25) ELSE 0 END AS points
 FROM public.fantasy_match_stats ms JOIN public.fantasy_rounds fr ON fr.id=ms.round_id JOIN public.fantasy_import_batches b ON b.id=ms.import_batch_id
 WHERE ms.season_id=target_season_id AND ms.player_id=p.player_id AND fr.round_number<=r.round_number AND fr.pricing_eligible AND fr.round_kind='regular' AND b.status='published'
 ORDER BY ms.match_date DESC,ms.id DESC LIMIT 2) scored;
 rolling:=round(baseline*cfg.rolling_baseline_weight+coalesce(recent[1],baseline)*cfg.rolling_recent_game_weight+coalesce(recent[2],baseline)*cfg.rolling_recent_game_weight,4);
 next_price:=greatest(cfg.initial_price_floor_dino_dollars,least(cfg.initial_price_ceiling_dino_dollars,old.price_dino_dollars+round((rolling-coalesce(old.rolling_performance_points,baseline))*cfg.price_point_value_dino_dollars)::bigint));
 evidence:=jsonb_build_object('round',r.round_number,'cutoff',now(),'recent_points',coalesce(recent,ARRAY[]::numeric[]),'previous_price_id',old.id,'late_results','next settlement');
 INSERT INTO public.fantasy_player_prices(season_id,player_id,effective_round_id,price_dino_dollars,price_million,formula_version,prior_baseline_points,previous_rolling_performance_points,rolling_performance_points,price_change_dino_dollars,source_status,calculation,published_at)
 VALUES(target_season_id,p.player_id,r.id,next_price,next_price/1000000.0,'dino-two-round-v1',baseline,coalesce(old.rolling_performance_points,baseline),rolling,next_price-old.price_dino_dollars,old.source_status,evidence,now());
 UPDATE public.fantasy_player_prices SET created_at=clock_timestamp() WHERE season_id=target_season_id AND player_id=p.player_id AND effective_round_id=r.id;
 INSERT INTO public.fantasy_price_calculations(season_id,player_id,effective_round_id,formula_version,prior_baseline_points,recent_points,previous_rolling_performance_points,rolling_performance_points,previous_price_dino_dollars,price_change_dino_dollars,new_price_dino_dollars,source_status,evidence,published_at)
 VALUES(target_season_id,p.player_id,r.id,'dino-two-round-v1',baseline,coalesce(recent,ARRAY[]::numeric[]),coalesce(old.rolling_performance_points,baseline),rolling,old.price_dino_dollars,next_price-old.price_dino_dollars,next_price,old.source_status,evidence,now());
 changed:=changed+1;
 END LOOP;
 INSERT INTO public.fantasy_price_windows(season_id,round_id,player_count) VALUES(target_season_id,r.id,changed);
 windows:=windows+1;
 END LOOP;
 RETURN jsonb_build_object('windows',windows,'players_last_window',changed);
END $$;
REVOKE ALL ON FUNCTION public.settle_dino_price_windows(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_dino_price_windows(uuid) TO service_role;

CREATE FUNCTION public.override_dino_player_price(target_season_id uuid,target_player_id uuid,new_price bigint,reason text,actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.fantasy_player_prices%ROWTYPE; cfg public.fantasy_dino_settings%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('dino-prices:'||target_season_id::text,0));
 SELECT * INTO STRICT cfg FROM public.fantasy_dino_settings WHERE season_id=target_season_id;
 IF new_price IS NULL OR new_price<cfg.initial_price_floor_dino_dollars OR new_price>cfg.initial_price_ceiling_dino_dollars OR length(trim(coalesce(reason,'')))<5 OR length(trim(coalesce(actor,'')))=0 THEN RAISE EXCEPTION 'Valid price, reason and actor required'; END IF;
 SELECT * INTO old FROM public.fantasy_player_prices WHERE season_id=target_season_id AND player_id=target_player_id AND published_at IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
 IF old.id IS NULL THEN
 INSERT INTO public.fantasy_player_prices(season_id,player_id,price_dino_dollars,price_million,formula_version,source_status,prior_baseline_points,rolling_performance_points,published_at)
 VALUES(target_season_id,target_player_id,new_price,new_price/1000000.0,'dino-manual-v1','unrated',0,0,now());
 ELSE
 IF old.price_dino_dollars=new_price THEN RETURN jsonb_build_object('unchanged',true); END IF;
 UPDATE public.fantasy_player_prices SET price_dino_dollars=new_price,price_million=new_price/1000000.0,calculation=calculation||jsonb_build_object('manual_reason',reason,'manual_actor',actor,'manual_at',now()) WHERE id=old.id;
 END IF;
 INSERT INTO public.fantasy_manual_price_audit(season_id,player_id,old_price,new_price,reason,actor) VALUES(target_season_id,target_player_id,old.price_dino_dollars,new_price,reason,actor);
 RETURN jsonb_build_object('price_dino_dollars',new_price);
END $$;
REVOKE ALL ON FUNCTION public.override_dino_player_price(uuid,uuid,bigint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.override_dino_player_price(uuid,uuid,bigint,text,text) TO service_role;
