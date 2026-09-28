-- Club decision (28 September 2026): remove the Dino Coach men's and women's
-- section minimum altogether. Squad validation returns to the normal rules
-- (15 slots, budget, captain and vice-captain, eligibility, open window).
-- Existing squads, purchase costs, rules_version and every manager's recorded
-- acceptance are unchanged. The women_eligible and men_eligible membership
-- columns are kept as recorded club data only; nothing reads them for rules.
-- Rollback: re-apply 20260927110000, 20260927120000 and 20260927130000 in
-- order on a replica first (they add the settings columns, validator, save
-- check and score trigger), then enable the flag with a reviewed operation.
BEGIN;
SET LOCAL lock_timeout = '3s';

DROP TRIGGER IF EXISTS enforce_dino_score_women_selection ON public.fantasy_manager_round_scores;
DROP FUNCTION IF EXISTS public.check_dino_score_women_selection();

-- Remove only the block 20260927110000 inserted into the base save RPC,
-- retaining every other installed fix in that function.
DO $$
DECLARE
  definition text;
  anchor text := '  IF invalid_count>0 THEN RAISE EXCEPTION ''Dino Coach squad has an invalid slot or player.'' USING ERRCODE=''check_violation''; END IF;';
  inserted text := E'\n  IF target_status=''submitted'' THEN\n    PERFORM public.validate_dino_women_selection(target_season_id,selected_players);\n  END IF;';
BEGIN
  SELECT pg_get_functiondef('public.save_dino_coach_squad(uuid,uuid,uuid,text,bigint,jsonb)'::regprocedure) INTO definition;
  IF strpos(definition,anchor || inserted)>0 THEN
    EXECUTE replace(definition,anchor || inserted,anchor);
  ELSIF strpos(definition,'validate_dino_women_selection')>0 THEN
    RAISE EXCEPTION 'save_dino_coach_squad changed; review before removing the section rule.';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.validate_dino_women_selection(uuid,jsonb);

ALTER TABLE public.fantasy_dino_settings DROP COLUMN IF EXISTS women_rule_enabled;
ALTER TABLE public.fantasy_dino_settings DROP COLUMN IF EXISTS women_update_deadline;

COMMENT ON COLUMN public.fantasy_season_players.women_eligible IS
  'Recorded club women''s section membership. Not used by any Dino Coach rule since 20260928140000.';
COMMENT ON COLUMN public.fantasy_season_players.men_eligible IS
  'Recorded club men''s section membership. Not used by any Dino Coach rule since 20260928140000.';

NOTIFY pgrst,'reload schema';
COMMIT;
