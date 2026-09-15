-- Consume only the exact stat snapshots used in this calculation, even during concurrent imports.
CREATE OR REPLACE FUNCTION public.settle_dino_price_windows(target_season_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg public.fantasy_dino_settings%ROWTYPE; r record; p record; old public.fantasy_player_prices%ROWTYPE;
 recent numeric[]; stat_ids uuid[]; stat_fingerprints text[]; baseline numeric; rolling numeric; next_price bigint; changed integer:=0; windows integer:=0; evidence jsonb;
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
 SELECT array_agg(points ORDER BY match_date DESC,id DESC),array_agg(id ORDER BY match_date DESC,id DESC),array_agg(fingerprint ORDER BY match_date DESC,id DESC) INTO recent,stat_ids,stat_fingerprints FROM (
 SELECT ms.id,ms.match_date,md5(to_jsonb(ms)::text) AS fingerprint,
 ms.runs*coalesce((cfg.scoring_config->>'runPoints')::numeric,1)+ms.wickets*coalesce((cfg.scoring_config->>'wicketPoints')::numeric,10)+
 ms.catches*coalesce((cfg.scoring_config->>'catchPoints')::numeric,10)+ms.runouts*coalesce((cfg.scoring_config->>'runoutPoints')::numeric,10)+
 ms.maidens*coalesce((cfg.scoring_config->>'maidenPoints')::numeric,5)+ms.stumpings*coalesce((cfg.scoring_config->>'stumpingPoints')::numeric,10)+
 CASE WHEN ms.not_out THEN coalesce((cfg.scoring_config->>'notOutPoints')::numeric,10) ELSE 0 END+
 CASE WHEN ms.runs>=100 THEN coalesce((cfg.scoring_config->>'centuryBonus')::numeric,50) WHEN ms.runs>=50 THEN coalesce((cfg.scoring_config->>'fiftyBonus')::numeric,20) ELSE 0 END+
 CASE WHEN ms.wickets>=7 THEN coalesce((cfg.scoring_config->>'sevenWicketBonus')::numeric,50) WHEN ms.wickets>=5 THEN coalesce((cfg.scoring_config->>'fiveWicketBonus')::numeric,25) ELSE 0 END AS points
 FROM public.fantasy_match_stats ms JOIN public.fantasy_rounds fr ON fr.id=ms.round_id JOIN public.fantasy_import_batches b ON b.id=ms.import_batch_id
 WHERE ms.season_id=target_season_id AND ms.player_id=p.player_id AND fr.round_number<=r.round_number AND fr.pricing_eligible AND fr.round_kind='regular' AND b.status='published' AND ms.match_date<=current_date
 AND NOT EXISTS(SELECT 1 FROM public.fantasy_priced_appearances a WHERE a.season_id=target_season_id AND a.stat_id=ms.id AND a.fingerprint=md5(to_jsonb(ms)::text))
 ORDER BY ms.match_date DESC,ms.id DESC) scored;
 IF recent IS NULL THEN rolling:=coalesce(old.rolling_performance_points,baseline);
 ELSIF cardinality(recent)=1 THEN rolling:=round(baseline*(cfg.rolling_baseline_weight+cfg.rolling_recent_game_weight)+recent[1]*cfg.rolling_recent_game_weight,4);
 ELSE SELECT round(baseline*cfg.rolling_baseline_weight+avg(v)*2*cfg.rolling_recent_game_weight,4) INTO rolling FROM unnest(recent) v; END IF;
 next_price:=greatest(cfg.initial_price_floor_dino_dollars,least(cfg.initial_price_ceiling_dino_dollars,old.price_dino_dollars+round((rolling-coalesce(old.rolling_performance_points,baseline))*cfg.price_point_value_dino_dollars)::bigint));
 evidence:=jsonb_build_object('round',r.round_number,'cutoff',now(),'recent_points',coalesce(recent,ARRAY[]::numeric[]),'previous_price_id',old.id,'late_results','next settlement');
 INSERT INTO public.fantasy_player_prices(season_id,player_id,effective_round_id,price_dino_dollars,price_million,formula_version,prior_baseline_points,previous_rolling_performance_points,rolling_performance_points,price_change_dino_dollars,source_status,calculation,published_at)
 VALUES(target_season_id,p.player_id,r.id,next_price,next_price/1000000.0,'dino-two-round-v1',baseline,coalesce(old.rolling_performance_points,baseline),rolling,next_price-old.price_dino_dollars,old.source_status,evidence,now());
 UPDATE public.fantasy_player_prices SET created_at=clock_timestamp() WHERE season_id=target_season_id AND player_id=p.player_id AND effective_round_id=r.id;
 INSERT INTO public.fantasy_price_calculations(season_id,player_id,effective_round_id,formula_version,prior_baseline_points,recent_points,previous_rolling_performance_points,rolling_performance_points,previous_price_dino_dollars,price_change_dino_dollars,new_price_dino_dollars,source_status,evidence,published_at)
 VALUES(target_season_id,p.player_id,r.id,'dino-two-round-v1',baseline,coalesce(recent,ARRAY[]::numeric[]),coalesce(old.rolling_performance_points,baseline),rolling,old.price_dino_dollars,next_price-old.price_dino_dollars,next_price,old.source_status,evidence,now());
 INSERT INTO public.fantasy_priced_appearances(season_id,stat_id,fingerprint,round_id)
 SELECT target_season_id,stat_ids[i],stat_fingerprints[i],r.id FROM generate_subscripts(stat_ids,1) i
 ON CONFLICT(season_id,stat_id) DO UPDATE SET fingerprint=EXCLUDED.fingerprint,round_id=EXCLUDED.round_id;
 changed:=changed+1;
 END LOOP;
 INSERT INTO public.fantasy_price_windows(season_id,round_id,player_count) VALUES(target_season_id,r.id,changed);
 windows:=windows+1;
 END LOOP;
 RETURN jsonb_build_object('windows',windows,'players_last_window',changed);
END $$;
