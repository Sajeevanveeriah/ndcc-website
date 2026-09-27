-- Club decision: the section minimum needs two different players. A player
-- recorded in both sections can represent either section, but not both at once.
-- Validator signature, grants and callers are unchanged.
-- Rollback: re-apply 20260927120000_dino_section_squad_minimum.sql.
BEGIN;
SET LOCAL lock_timeout = '3s';
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
  -- With at least one in each section, two distinct represented players
  -- always allow one different player per section.
  IF women_count<1 OR men_count<1 OR represented_count<2 THEN
    RAISE EXCEPTION 'All teams must include at least one player from the men’s and women’s sections in the squad' USING ERRCODE='check_violation';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_dino_women_selection(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_dino_women_selection(uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
