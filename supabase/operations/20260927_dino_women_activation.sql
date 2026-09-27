-- Reviewed production data operation. Apply after the schema/application release
-- after verifying these recorded identities still belong to the current pool.
-- Unreviewed classifications stay NULL and can be confirmed by the club in admin.
-- Rollback: disable women_rule_enabled and restore rules_version to rev06 for
-- this season. Retain eligibility data and each manager's recorded acceptance.
BEGIN;
SET LOCAL lock_timeout = '3s';
-- Seed from the committee season summary's explicitly recorded women's teams.
-- This does not change active/selectable status (including junior exclusions).
UPDATE public.fantasy_season_players SET women_eligible=true
WHERE season_id='75425550-0622-4ecb-87c4-69ab5ca40a53'
  AND source='committee_season_summary' AND team_label ILIKE '%Womens%';
-- Verified existing identities: club 2026/27 Women's XI captain announcement
-- https://www.ndcc.com.au/news/a3a154f3-7959-40f1-8843-c5dd257f9e9d
-- and recorded CricX women's player profiles (Caitlin-Rose Neil and Skye Green).
UPDATE public.fantasy_season_players SET women_eligible=true
WHERE season_id='75425550-0622-4ecb-87c4-69ab5ca40a53' AND player_id IN (
  '7b714120-e008-4dad-9b09-b34ddc2b1948', -- Kelsey Allan
  '8bc3ca26-e9bb-4b2c-8b91-764fdae8e79c', -- Jodie Clark
  '8382c5da-8788-4d75-aea9-fb78080ab54a', -- Caitlin-Rose Neil
  '570f697e-565e-4c12-b01e-682e22e6515d'  -- Skye Green
);

-- This season has not scored yet. Fail closed if that changes before release;
-- a mid-season change needs an explicit effective-round policy instead.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fantasy_manager_round_scores WHERE season_id='75425550-0622-4ecb-87c4-69ab5ca40a53') THEN
    RAISE EXCEPTION 'Season already has scores; review the women rule activation round.';
  END IF;
  UPDATE public.fantasy_dino_settings SET women_rule_enabled=true,rules_version='2026-27-rev07',
    women_update_deadline='2026-10-02T23:59:59+10:00'
  WHERE season_id='75425550-0622-4ecb-87c4-69ab5ca40a53' AND rules_version='2026-27-rev06';
  IF NOT FOUND THEN RAISE EXCEPTION 'Rules version changed; review before activation.'; END IF;
END;
$$;
COMMIT;
