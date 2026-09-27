-- Club-approved squad rule; bench players count and no starting-XI minimum applies.
-- Legacy women_rule_enabled and validator names remain for compatibility.
-- Rollback: disable women_rule_enabled; retain rules_version and acceptances.
BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER TABLE public.fantasy_season_players ADD COLUMN IF NOT EXISTS men_eligible boolean;
COMMENT ON COLUMN public.fantasy_season_players.men_eligible IS 'Club-confirmed men’s section membership. NULL means unreviewed; never infer from names or absence of women’s membership.';
COMMENT ON COLUMN public.fantasy_season_players.women_eligible IS 'Club-confirmed women’s section membership. NULL means unreviewed. Players recorded in both sections may represent both.';
CREATE OR REPLACE FUNCTION public.validate_dino_women_selection(target_season_id uuid, selected_players jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE women_count integer; men_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fantasy_dino_settings
    WHERE season_id=target_season_id AND women_rule_enabled) THEN RETURN; END IF;
  SELECT count(DISTINCT sp.player_id) FILTER (WHERE sp.women_eligible IS TRUE),
         count(DISTINCT sp.player_id) FILTER (WHERE sp.men_eligible IS TRUE)
    INTO women_count,men_count
  FROM jsonb_array_elements(selected_players) item
  JOIN public.fantasy_season_players sp ON sp.season_id=target_season_id
    AND sp.player_id=(item->>'player_id')::uuid;
  IF women_count<1 OR men_count<1 THEN
    RAISE EXCEPTION 'All teams must include at least one player from the men’s and women’s sections in the squad' USING ERRCODE='check_violation';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_dino_women_selection(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_dino_women_selection(uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
