-- NDCC Dino Coach catalogue correction approved by Saj on 9 October 2026.
-- Data operation only: run against the NDCC production database with an authorised
-- database role. A Git/Vercel deployment does not execute this SQL automatically.
-- Keep player IDs, prices, saved squads and historical season memberships intact.
-- The supplied "Elliot Ridgeway" matches stored "Elliot Ridgway"; supplied
-- "Staff Scaffidi" matches stored "Scaff Scaffidi" (historical alias for Antonio).
-- Nathan Laffy is excluded for now, as requested, and can be restored later.
-- Deploy the historical-name lookup fix before applying this data correction.
-- Rollback: run rollback-dino-catalogue-20261009.sql after reviewing current state.
-- Public catalogue cache expires after 60 seconds; verify the live page and API.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE catalogue_removals (player_id uuid PRIMARY KEY, expected_name text NOT NULL) ON COMMIT DROP;
INSERT INTO catalogue_removals VALUES
  ('e43f0e00-828e-43ce-9a91-a3b913f3a3d0', 'Aaron Bangar'),
  ('614e45a2-e511-4c83-b64b-eb52ea327844', 'Cam Brady'),
  ('6ccef387-273c-4aeb-8da5-e4cd7abb2011', 'Carly Hillgrove'),
  ('0b2ea84c-aea0-4e38-be1a-f85f490fb793', 'Chloe Hillgrove'),
  ('851b5358-b345-4007-9604-e27cf3bb2a67', 'Dave O’Leary'),
  ('0ff2686f-7acc-40f7-9745-bfa4e332e40c', 'Elliot Ridgway'),
  ('2bb544fa-4505-431f-9b66-b9ce451a6213', 'Emma Jones'),
  ('9c33bb22-860f-4ae5-9076-8ac47d001668', 'Elysha Fox'),
  ('36cb4525-ef1e-4815-9516-b754dfef0959', 'Grace Elliott'),
  ('7afc9792-a7d6-4960-89c3-82cfb41b5b7e', 'Jazz Priest'),
  ('028ae1f1-feb7-4729-9026-61eebd6612bd', 'Josh Ritchie'),
  ('7830ef21-5047-4923-a32f-816ea0cfab7f', 'Leisha Appleyard'),
  ('261d7101-8b92-4b76-b539-5d815e3eb389', 'Nathan Laffy'),
  ('f791a73b-858f-4de9-a316-0e57168b32ad', 'Noah Evans'),
  ('4e38785d-e138-4ec4-865b-2e0c377d356d', 'Scott Evans');

CREATE TEMP TABLE catalogue_renames (player_id uuid PRIMARY KEY, old_name text NOT NULL, new_name text NOT NULL) ON COMMIT DROP;
INSERT INTO catalogue_renames VALUES
  ('fc7b8d01-e5f5-4a77-88b9-f7da7561952e', 'D Whitworth', 'Daniel Whitworth'),
  ('c928fc73-2c37-430b-99f9-d5edba97625d', 'Harro Harrison', 'Daniel Harrison'),
  ('d8cd5eb8-1716-4a59-9b10-61935e0e32c4', 'Scaff Scaffidi', 'Antonio Scaffidi');

DO $catalogue$
DECLARE
  target_season_id constant uuid := '75425550-0622-4ecb-87c4-69ab5ca40a53';
  reason constant text := 'Club catalogue removal approved 2026-10-09';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fantasy_seasons s WHERE s.id = target_season_id AND s.is_current AND s.slug = '2026-27') THEN
    RAISE EXCEPTION 'Expected current Dino Coach 2026/2027 season is missing';
  END IF;

  -- Lock only the 18 reviewed identities and their current-season memberships.
  PERFORM p.id FROM public.fantasy_players p
    WHERE p.id IN (SELECT player_id FROM catalogue_removals UNION SELECT player_id FROM catalogue_renames)
    ORDER BY p.id FOR UPDATE;
  PERFORM sp.id FROM public.fantasy_season_players sp
    WHERE sp.season_id = target_season_id
      AND sp.player_id IN (SELECT player_id FROM catalogue_removals UNION SELECT player_id FROM catalogue_renames)
    ORDER BY sp.id FOR UPDATE;

  IF (SELECT count(*) FROM catalogue_removals r JOIN public.fantasy_players p ON p.id = r.player_id AND p.display_name = r.expected_name
      JOIN public.fantasy_season_players sp ON sp.player_id = p.id AND sp.season_id = target_season_id
      WHERE (sp.active AND sp.selectable AND sp.eligibility_exclusion IS NULL)
         OR (NOT sp.active AND NOT sp.selectable AND sp.eligibility_exclusion = reason)) <> 15 THEN
    RAISE EXCEPTION 'Removal identities or eligibility changed; review before applying';
  END IF;
  IF (SELECT count(*) FROM catalogue_renames r JOIN public.fantasy_players p ON p.id = r.player_id AND p.display_name IN (r.old_name, r.new_name)
      JOIN public.fantasy_season_players sp ON sp.player_id = p.id AND sp.season_id = target_season_id
      WHERE sp.active AND sp.selectable) <> 3 THEN
    RAISE EXCEPTION 'Rename identities or eligibility changed; review before applying';
  END IF;
  IF EXISTS (SELECT 1 FROM catalogue_renames r JOIN public.fantasy_players p ON lower(p.display_name) = lower(r.new_name) AND p.id <> r.player_id) THEN
    RAISE EXCEPTION 'A corrected name belongs to another identity; manual review required';
  END IF;

  UPDATE public.fantasy_season_players sp
    SET active = false, selectable = false, eligibility_exclusion = reason
    FROM catalogue_removals r
    WHERE sp.season_id = target_season_id AND sp.player_id = r.player_id
      AND (sp.active OR sp.selectable OR sp.eligibility_exclusion IS DISTINCT FROM reason);
  UPDATE public.fantasy_players p SET display_name = r.new_name
    FROM catalogue_renames r WHERE p.id = r.player_id AND p.display_name = r.old_name;

  IF (SELECT count(*) FROM public.fantasy_season_players sp JOIN catalogue_removals r ON r.player_id = sp.player_id
      WHERE sp.season_id = target_season_id AND NOT sp.active AND NOT sp.selectable AND sp.eligibility_exclusion = reason) <> 15
    OR (SELECT count(*) FROM public.fantasy_players p JOIN catalogue_renames r ON r.player_id = p.id AND p.display_name = r.new_name) <> 3 THEN
    RAISE EXCEPTION 'Catalogue update did not satisfy all 18 requested changes';
  END IF;
END
$catalogue$;

COMMIT;
