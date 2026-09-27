-- Option 2: two women in the squad, including at least one in the playing XI.
-- Rollback: set women_rule_enabled=false for the affected season and restore
-- rules_version='2026-27-rev06'. Keep eligibility records and accepted versions;
-- never rewrite a manager's rules acceptance. Revert the application separately.
BEGIN;
SET LOCAL lock_timeout = '3s';

ALTER TABLE public.fantasy_season_players ADD COLUMN women_eligible boolean;
COMMENT ON COLUMN public.fantasy_season_players.women_eligible IS
  'Club-confirmed eligibility for the women selection minimum. NULL means not reviewed; only true counts. Independent of cricket role and grade.';
ALTER TABLE public.fantasy_dino_settings ADD COLUMN women_rule_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.fantasy_dino_settings ADD COLUMN women_update_deadline timestamptz;

CREATE FUNCTION public.validate_dino_women_selection(target_season_id uuid, selected_players jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE squad_count integer; starter_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fantasy_dino_settings
    WHERE season_id=target_season_id AND women_rule_enabled) THEN RETURN; END IF;
  SELECT count(DISTINCT sp.player_id),
    count(DISTINCT sp.player_id) FILTER (WHERE item->>'position_type'='starter')
  INTO squad_count,starter_count
  FROM jsonb_array_elements(selected_players) item
  JOIN public.fantasy_season_players sp ON sp.season_id=target_season_id
    AND sp.player_id=(item->>'player_id')::uuid AND sp.women_eligible IS TRUE;
  IF squad_count<2 THEN
    RAISE EXCEPTION 'Select at least two women in your 15-player squad.' USING ERRCODE='check_violation';
  END IF;
  IF starter_count<1 THEN
    RAISE EXCEPTION 'Select at least one woman in your playing XI.' USING ERRCODE='check_violation';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_dino_women_selection(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_dino_women_selection(uuid,jsonb) TO service_role;

-- All save paths (v2, market swap and audited admin edit) call this base RPC.
-- Insert only the new invariant, retaining the installed wallet/expiry fixes.
DO $$
DECLARE definition text; anchor text := '  IF invalid_count>0 THEN RAISE EXCEPTION ''Dino Coach squad has an invalid slot or player.'' USING ERRCODE=''check_violation''; END IF;';
BEGIN
  SELECT pg_get_functiondef('public.save_dino_coach_squad(uuid,uuid,uuid,text,bigint,jsonb)'::regprocedure) INTO definition;
  IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'Squad validation anchor changed; review migration before applying.'; END IF;
  EXECUTE replace(definition,anchor,anchor || E'\n  IF target_status=''submitted'' THEN\n    PERFORM public.validate_dino_women_selection(target_season_id,selected_players);\n  END IF;');
END;
$$;

-- Existing submissions are preserved. Refuse score publication if one of those
-- squads (including a carry-forward) has not yet met the new rule. No silent
-- disqualification, roster replacement or backdated zero scores.
CREATE FUNCTION public.check_dino_score_women_selection() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE picks jsonb;
BEGIN
  -- Preserve the existing ON DELETE SET NULL history behaviour.
  IF TG_OP='UPDATE' AND OLD.squad_id IS NOT NULL AND NEW.squad_id IS NULL THEN RETURN NEW; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('player_id',player_id,'position_type',position_type)),'[]'::jsonb)
    INTO picks FROM public.fantasy_squad_players WHERE squad_id=NEW.squad_id;
  PERFORM public.validate_dino_women_selection(NEW.season_id,picks);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_dino_score_women_selection() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enforce_dino_score_women_selection BEFORE INSERT OR UPDATE
ON public.fantasy_manager_round_scores FOR EACH ROW
EXECUTE FUNCTION public.check_dino_score_women_selection();

NOTIFY pgrst,'reload schema';
COMMIT;
