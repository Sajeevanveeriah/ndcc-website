-- Rollback for 20260928140000_remove_dino_section_rule.sql. Only run after an
-- explicit club decision to restore the men's and women's section minimum.
-- Restores exactly the removed objects: the settings flag and deadline
-- columns, the distinct-players validator (as in 20260927130000), the check in
-- the base save RPC and the score-publication trigger. The women_eligible and
-- men_eligible columns were retained, so they are not re-added. The flag is
-- restored as false: enable it for a season with a separate reviewed operation.
BEGIN;
SET LOCAL lock_timeout = '3s';

ALTER TABLE public.fantasy_dino_settings ADD COLUMN IF NOT EXISTS women_rule_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.fantasy_dino_settings ADD COLUMN IF NOT EXISTS women_update_deadline timestamptz;

CREATE OR REPLACE FUNCTION public.validate_dino_women_selection(target_season_id uuid, selected_players jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE women_count integer; men_count integer; represented_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fantasy_dino_settings
    WHERE season_id=target_season_id AND women_rule_enabled) THEN RETURN; END IF;
  SELECT count(DISTINCT sp.player_id) FILTER (WHERE sp.women_eligible IS TRUE),
         count(DISTINCT sp.player_id) FILTER (WHERE sp.men_eligible IS TRUE),
         count(DISTINCT sp.player_id) FILTER (WHERE sp.women_eligible IS TRUE OR sp.men_eligible IS TRUE)
    INTO women_count,men_count,represented_count
  FROM jsonb_array_elements(selected_players) item
  JOIN public.fantasy_season_players sp ON sp.season_id=target_season_id
    AND sp.player_id=(item->>'player_id')::uuid;
  IF women_count<1 OR men_count<1 OR represented_count<2 THEN
    RAISE EXCEPTION 'All teams must include at least one player from the men’s and women’s sections in the squad' USING ERRCODE='check_violation';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_dino_women_selection(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_dino_women_selection(uuid,jsonb) TO service_role;

DO $$
DECLARE
  definition text;
  anchor text := '  IF invalid_count>0 THEN RAISE EXCEPTION ''Dino Coach squad has an invalid slot or player.'' USING ERRCODE=''check_violation''; END IF;';
BEGIN
  SELECT pg_get_functiondef('public.save_dino_coach_squad(uuid,uuid,uuid,text,bigint,jsonb)'::regprocedure) INTO definition;
  IF strpos(definition,'validate_dino_women_selection')>0 THEN RETURN; END IF;
  IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'Squad validation anchor changed; review before restoring.'; END IF;
  EXECUTE replace(definition,anchor,anchor || E'\n  IF target_status=''submitted'' THEN\n    PERFORM public.validate_dino_women_selection(target_season_id,selected_players);\n  END IF;');
END;
$$;

CREATE OR REPLACE FUNCTION public.check_dino_score_women_selection() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE picks jsonb;
BEGIN
  IF TG_OP='UPDATE' AND OLD.squad_id IS NOT NULL AND NEW.squad_id IS NULL THEN RETURN NEW; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('player_id',player_id,'position_type',position_type)),'[]'::jsonb)
    INTO picks FROM public.fantasy_squad_players WHERE squad_id=NEW.squad_id;
  PERFORM public.validate_dino_women_selection(NEW.season_id,picks);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_dino_score_women_selection() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS enforce_dino_score_women_selection ON public.fantasy_manager_round_scores;
CREATE TRIGGER enforce_dino_score_women_selection BEFORE INSERT OR UPDATE
ON public.fantasy_manager_round_scores FOR EACH ROW
EXECUTE FUNCTION public.check_dino_score_women_selection();

NOTIFY pgrst,'reload schema';
COMMIT;
