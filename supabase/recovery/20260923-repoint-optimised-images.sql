-- Reviewed operator SQL: repoint database references to optimised public assets.
-- Generated 2026-09-23 from lib/asset-redirects.json (75 old -> new paths).
--
-- Context: large PNG/JPEG files under public/ were converted to WebP, exact
-- duplicates were collapsed to one canonical file, and a superseded Dino Coach
-- manual was retired (scripts/optimise-public-images.mjs). Every old path keeps
-- working through a permanent redirect in next.config.mjs, so this data fix is
-- not urgent; it removes the redirect hop (which next/image cannot follow) by
-- storing the final paths.
--
-- This is a data fix, NOT a migration. It is kept out of supabase/migrations so
-- migration-history checks are unaffected. It is idempotent: new paths never
-- contain an old path, so a second run matches no rows.
--
-- Scope: the columns below only. editorial_revisions.snapshot is history and is
-- intentionally NOT modified. Matching is by path substring (strpos, so "_" is
-- literal), which also covers absolute URLs such as
-- https://www.ndcc.com.au/images/... and "public/images/..." spellings.
--
-- The events -> calendar_events sync trigger is disabled for the duration of the
-- transaction: an events.image_url change would otherwise INSERT a new calendar
-- row for any event without a linked calendar entry. calendar_events.image_url
-- is repointed directly instead. (ALTER TABLE requires the table owner, e.g. the
-- postgres role in the Supabase SQL editor.)
--
-- Usage: run as-is first (it ends in ROLLBACK), review the backup counts and the
-- final remaining-reference count (expect 0 in every row), then change ROLLBACK
-- to COMMIT and run again.
-- Rollback after COMMIT: restore columns from public.asset_repoint_backup_20260923
-- (row_data holds each changed row as it was before this fix).

BEGIN;

CREATE TEMPORARY TABLE ndcc_asset_path_map (old_path text PRIMARY KEY, new_path text NOT NULL) ON COMMIT DROP;
INSERT INTO ndcc_asset_path_map (old_path, new_path) VALUES
  ('/documents/20260918-Dino-Coach-User-Manual-Rev00.pdf', '/documents/20260919-Dino-Coach-User-Manual-Rev01.pdf'),
  ('/images/2026/05/caitlin-rose-neil-1778495351649.png', '/images/2026/05/caitlin-rose-neil-1778495351649.webp'),
  ('/images/2026/05/jodie-clark-1778495304142.png', '/images/2026/05/jodie-clark-1778495304142.webp'),
  ('/images/2026/05/skye-green-1778495377710.png', '/images/2026/05/skye-green-1778495377710.webp'),
  ('/images/2026/05/tyler_o-neil-1779946882165.png', '/images/2026/05/tyler_o-neil-1779946882165.webp'),
  ('/images/2026/05/tyler_o-neil_thank_you-1779588273839.png', '/images/2026/05/tyler_o-neil_thank_you-1779588273839.webp'),
  ('/images/2026/06/20260620_jayde-smith-rev03-1782799804995.png', '/images/2026/06/20260620_jayde-smith-rev03-1782799804995.webp'),
  ('/images/2026/06/Daniel_Harrison.png', '/images/2026/06/Daniel_Harrison.webp'),
  ('/images/2026/06/Rhys_Bath.png', '/images/2026/06/Rhys_Bath.webp'),
  ('/images/2026/06/daniel_harrison-1781136859075.png', '/images/2026/06/daniel_harrison-1781136859075.webp'),
  ('/images/2026/06/elliot_ridgway-1781147981107.png', '/images/2026/06/elliot_ridgway-1781147981107.webp'),
  ('/images/2026/06/gautham_ranjith-1781148071095.png', '/images/2026/06/gautham_ranjith-1781148071095.webp'),
  ('/images/2026/06/harvey_cliff-1781148015761.png', '/images/2026/06/harvey_cliff-1781148015761.webp'),
  ('/images/2026/06/jason_robertson_rev02-1780914940929.png', '/images/2026/06/jason_robertson_rev02-1780914940929.webp'),
  ('/images/2026/06/rhys_bath-1781078437785.png', '/images/2026/06/Rhys_Bath.webp'),
  ('/images/2026/06/rhys_bath-1781136875171.png', '/images/2026/06/rhys_bath-1781136875171.webp'),
  ('/images/2026/07/20260322_club-championship-compressed-rev00-1783160205132.png', '/images/2026/07/20260322_club-championship-compressed-rev00-1783160205132.webp'),
  ('/images/2026/07/20260702-ndcc-trailer-raffle-rev01-1784876370561.png', '/images/2026/07/20260702-ndcc-trailer-raffle-rev01-1784876370561.webp'),
  ('/images/2026/07/20260708-katie-appleyard-rev00-1783506486988.png', '/images/2026/07/20260708-katie-appleyard-rev00-1783506486988.webp'),
  ('/images/2026/07/20260709-cp-rev00-1783552636750.png', '/images/2026/09/20260709-cp-rev00-1788948529929.png'),
  ('/images/2026/07/20260721-valentine-rev00-1784876517472.png', '/images/2026/09/20260721-valentine-rev00-1789369382541.png'),
  ('/images/2026/07/20260724-ndcc-gca4-1st-xi-fixtures-rev01-1784876337463.png', '/images/2026/07/20260724-ndcc-gca4-1st-xi-fixtures-rev01-1784876337463.webp'),
  ('/images/2026/07/20260724-ndcc-gca4-2nd-xi-fixtures-rev01-1784965752900.png', '/images/2026/07/20260724-ndcc-gca4-2nd-xi-fixtures-rev01-1784965752900.webp'),
  ('/images/2026/07/20260808-ruby-moreland-rev00-1783506461071.png', '/images/2026/07/20260808-ruby-moreland-rev00-1783506461071.webp'),
  ('/images/2026/08/20260606-player-sponsor-rev01-1785925385206.png', '/images/2026/08/20260606-player-sponsor-rev01-1785925385206.webp'),
  ('/images/2026/08/20260607-ndcc-pre-season-training-2026-2027-menu-format-rev0-1785925606619.jpg', '/images/2026/08/20260607-ndcc-pre-season-training-2026-2027-menu-format-rev0-1785925606619.webp'),
  ('/images/2026/08/20260607-ndcc-pre-season-training-2026-2027-menu-format-rev0-1787784894741.jpg', '/images/2026/08/20260607-ndcc-pre-season-training-2026-2027-menu-format-rev0-1785925606619.webp'),
  ('/images/2026/08/20260724-ndcc-gca4-1-2-xi-fixtures-rev01-1785925522651.png', '/images/2026/08/20260724-ndcc-gca4-1-2-xi-fixtures-rev01-1785925522651.webp'),
  ('/images/2026/08/20260731-poster-4-rev01-1785925307387.png', '/images/2026/08/20260731-poster-4-rev01-1785925307387.webp'),
  ('/images/2026/08/20260731-season-launch-rev00-1785925011182.png', '/images/2026/08/20260731-season-launch-rev00-1785925011182.webp'),
  ('/images/2026/08/20260731-season-launch-rev00-1786263617170.png', '/images/2026/08/20260731-season-launch-rev00-1785925011182.webp'),
  ('/images/2026/08/20260801-womens-2-rev02-1785925345424.png', '/images/2026/08/20260801-womens-2-rev02-1785925345424.webp'),
  ('/images/2026/08/20260809-apparel-order-rev00-1787784947493.png', '/images/2026/08/20260809-apparel-order-rev00-1787784947493.webp'),
  ('/images/2026/08/20260816-season-launch-rev00-1786831883333.jpg', '/images/2026/08/20260816-season-launch-rev00-1787785078275.webp'),
  ('/images/2026/08/20260816-season-launch-rev00-1787785078275.jpg', '/images/2026/08/20260816-season-launch-rev00-1787785078275.webp'),
  ('/images/2026/08/20260816-season-launch-rev00-1788158083188.jpg', '/images/2026/08/20260816-season-launch-rev00-1787785078275.webp'),
  ('/images/2026/08/20260827-ndcc-1xi-rev00-1788179023413.png', '/images/2026/08/20260827-ndcc-1xi-rev00-1788179023413.webp'),
  ('/images/2026/08/20260827-ndcc-2xi-rev00-1788179030582.png', '/images/2026/08/20260827-ndcc-2xi-rev00-1788179030582.webp'),
  ('/images/2026/08/20260827-ndcc-3xi-rev00-1788179039268.png', '/images/2026/08/20260827-ndcc-3xi-rev00-1788179039268.webp'),
  ('/images/2026/08/20260827-ndcc-4xi-rev00-1788179048876.png', '/images/2026/08/20260827-ndcc-4xi-rev00-1788179048876.webp'),
  ('/images/2026/08/20260827-ndcc-wxi-rev00-1788179056099.png', '/images/2026/08/20260827-ndcc-wxi-rev00-1788179056099.webp'),
  ('/images/2026/09/20260322-backdrop-rev00-1788846722333.png', '/images/2026/09/20260322-backdrop-rev00-1788846722333.webp'),
  ('/images/2026/09/20260709-cp-rev00-1788948565023.png', '/images/2026/09/20260709-cp-rev00-1788948529929.png'),
  ('/images/2026/09/20260709-cp-rev00-1788948586469.png', '/images/2026/09/20260709-cp-rev00-1788948529929.png'),
  ('/images/2026/09/20260731-season-launch-rev00-1788847798049.png', '/images/2026/08/20260731-season-launch-rev00-1785925011182.webp'),
  ('/images/2026/09/20260816-season-launch-rev00-1788847716346.jpg', '/images/2026/08/20260816-season-launch-rev00-1787785078275.webp'),
  ('/images/2026/09/20260906-phoenix-rev00-1788947924366.jpg', '/images/2026/06/phoenix-1781148703539.jpg'),
  ('/images/2026/09/20260908-egqb-logo-2024-rev00-1788868494777.png', '/images/2026/09/20260908-egqb-logo-2024-rev00-1788868494777.webp'),
  ('/images/2026/09/20260908-egqb-logo-2024-rev00-1788945275699.png', '/images/2026/09/20260908-egqb-logo-2024-rev00-1788868494777.webp'),
  ('/images/2026/09/20260908-finals-team-rev00-1788845548230.png', '/images/2026/09/20260908-finals-team-rev00-1788845548230.webp'),
  ('/images/2026/09/20260909-j-anderson-co-rhys-bath-rev00-1788943942284.jpg', '/images/2026/09/20260909-j-anderson-co-rhys-bath-rev00-1788945149438.jpg'),
  ('/images/2026/09/20260910-geelong-indoor-craig-hillgrove-rev00-1788998953403.png', '/images/2026/09/20260910-geelong-indoor-anthony-quarrell-rev00-1788998920047.png'),
  ('/images/2026/09/20260913-ndcc-practice-match-rev02.png', '/images/2026/09/20260913-ndcc-practice-match-rev02.webp'),
  ('/images/2026/09/20260914-ndcc-u13-recruitment-rev01-1789389120771.png', '/images/2026/09/20260914-ndcc-u13-recruitment-rev01-1789389120771.webp'),
  ('/images/2026/09/20260915-aq-cooper-giuricin-webb-rev00-1789423805387.png', '/images/2026/09/20260915-aq-cooper-giuricin-webb-rev00-1789423805387.webp'),
  ('/images/2026/09/20260915-aq-josh-fothergill-rev00-1789423841050.png', '/images/2026/09/20260915-aq-cooper-giuricin-webb-rev00-1789423805387.webp'),
  ('/images/2026/09/20260915-harro-ruben-brady-rev00-1789463674694.png', '/images/2026/09/20260915-harro-ruben-brady-rev00-1789463674694.webp'),
  ('/images/2026/09/20260915-ndcc-christmas-party-rev00-1789431855665.png', '/images/2026/09/20260915-ndcc-christmas-party-rev00-1789431855665.webp'),
  ('/images/2026/09/20260915-ndcc-halloween-rev00-1789431788742.png', '/images/2026/09/20260915-ndcc-halloween-rev00-1789431788742.webp'),
  ('/images/2026/09/20260915-ndcc-ipod-shuffle-rev00-1789431745951.png', '/images/2026/09/20260915-ndcc-ipod-shuffle-rev00-1789431745951.webp'),
  ('/images/2026/09/20260915-ndcc-karaoke-night-rev00-1789431875042.png', '/images/2026/09/20260915-ndcc-karaoke-night-rev00-1789431875042.webp'),
  ('/images/2026/09/20260915-ndcc-karaoke-night-rev00-1789431975739.png', '/images/2026/09/20260915-ndcc-karaoke-night-rev00-1789431875042.webp'),
  ('/images/2026/09/20260915-ndcc-presentation-night-rev00-1789432016570.png', '/images/2026/09/20260915-ndcc-presentation-night-rev00-1789432016570.webp'),
  ('/images/2026/09/20260915-ndcc-snail-racing-rev00-1789431768410.png', '/images/2026/09/20260915-ndcc-snail-racing-rev00-1789431768410.webp'),
  ('/images/2026/09/20260915-ndcc-trivia-night-rev00-1789431809851.png', '/images/2026/09/20260915-ndcc-trivia-night-rev00-1789431809851.webp'),
  ('/images/2026/09/20260915-ndcc-twilight-game-and-past-players-rev00-1789431995775.png', '/images/2026/09/20260915-ndcc-twilight-game-and-past-players-rev00-1789431995775.webp'),
  ('/images/2026/09/20260915-ndcc-twilight-market-rev00-1789431828965.png', '/images/2026/09/20260915-ndcc-twilight-market-rev00-1789431828965.webp'),
  ('/images/2026/09/20260915-terry-doyle-troy-whitworth-rev00-1789453422108.png', '/images/2026/09/20260915-terry-doyle-troy-whitworth-rev00-1789453422108.webp'),
  ('/images/2026/09/20260917-engine-room-rev00-1789600344054.jpg', '/images/2026/09/20260917-engine-room-rev00-1789600314546.jpg'),
  ('/images/2026/09/20260917-engine-room-rev00-1789600372045.jpg', '/images/2026/09/20260917-engine-room-rev00-1789600314546.jpg'),
  ('/images/20260922-NDCC-Reverse-Raffle-Rev00.png', '/images/20260922-NDCC-Reverse-Raffle-Rev00.webp'),
  ('/images/Connection_Bri_Hayes_Rev1.jpg', '/images/Connection_Bri_Hayes_Rev1.webp'),
  ('/images/Poster.png', '/images/Poster.webp'),
  ('/images/events/2026/agm-2026.png', '/images/events/2026/agm-2026.webp'),
  ('/images/sponsors/20260906/champion-trophies.png', '/images/sponsors/20260906/champion-trophies.webp');

CREATE OR REPLACE FUNCTION pg_temp.ndcc_repoint_assets(value text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  mapping record;
  result text := value;
BEGIN
  IF result IS NULL THEN RETURN NULL; END IF;
  FOR mapping IN SELECT old_path, new_path FROM ndcc_asset_path_map ORDER BY length(old_path) DESC, old_path LOOP
    result := replace(result, mapping.old_path, mapping.new_path);
  END LOOP;
  RETURN result;
END;
$$;

-- 1. Backup of every row about to change (service-only; not exposed to the API).
CREATE TABLE IF NOT EXISTS public.asset_repoint_backup_20260923 (
  source_table text NOT NULL,
  source_column text NOT NULL,
  row_data jsonb NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asset_repoint_backup_20260923 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asset_repoint_backup_20260923 FROM PUBLIC, anon, authenticated;

INSERT INTO public.asset_repoint_backup_20260923 (source_table, source_column, row_data)
SELECT 'news', 'image_url', to_jsonb(t) FROM public.news t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0);
INSERT INTO public.asset_repoint_backup_20260923 (source_table, source_column, row_data)
SELECT 'news', 'content', to_jsonb(t) FROM public.news t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.content, m.old_path) > 0);
INSERT INTO public.asset_repoint_backup_20260923 (source_table, source_column, row_data)
SELECT 'season_appointments', 'image_url', to_jsonb(t) FROM public.season_appointments t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0);
INSERT INTO public.asset_repoint_backup_20260923 (source_table, source_column, row_data)
SELECT 'player_sponsors', 'logo_url', to_jsonb(t) FROM public.player_sponsors t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.logo_url, m.old_path) > 0);
INSERT INTO public.asset_repoint_backup_20260923 (source_table, source_column, row_data)
SELECT 'apparel_products', 'image_url', to_jsonb(t) FROM public.apparel_products t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0);
INSERT INTO public.asset_repoint_backup_20260923 (source_table, source_column, row_data)
SELECT 'sponsors', 'logo_url', to_jsonb(t) FROM public.sponsors t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.logo_url, m.old_path) > 0);
INSERT INTO public.asset_repoint_backup_20260923 (source_table, source_column, row_data)
SELECT 'calendar_events', 'image_url', to_jsonb(t) FROM public.calendar_events t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0);
INSERT INTO public.asset_repoint_backup_20260923 (source_table, source_column, row_data)
SELECT 'events', 'image_url', to_jsonb(t) FROM public.events t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0);
INSERT INTO public.asset_repoint_backup_20260923 (source_table, source_column, row_data)
SELECT 'content_blocks', 'image_url', to_jsonb(t) FROM public.content_blocks t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0);
INSERT INTO public.asset_repoint_backup_20260923 (source_table, source_column, row_data)
SELECT 'gallery_images', 'image_url', to_jsonb(t) FROM public.gallery_images t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0);
INSERT INTO public.asset_repoint_backup_20260923 (source_table, source_column, row_data)
SELECT 'publications', 'document_url', to_jsonb(t) FROM public.publications t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.document_url, m.old_path) > 0);
INSERT INTO public.asset_repoint_backup_20260923 (source_table, source_column, row_data)
SELECT 'teams', 'image_url', to_jsonb(t) FROM public.teams t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0);

SELECT source_table, source_column, count(*) AS rows_backed_up
FROM public.asset_repoint_backup_20260923
WHERE backed_up_at = now()
GROUP BY source_table, source_column ORDER BY 1, 2;

-- 2. Repoint (one UPDATE per column).
ALTER TABLE public.events DISABLE TRIGGER sync_event_calendar;

UPDATE public.news t SET image_url = pg_temp.ndcc_repoint_assets(t.image_url) WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0);
UPDATE public.news t SET content = pg_temp.ndcc_repoint_assets(t.content) WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.content, m.old_path) > 0);
UPDATE public.season_appointments t SET image_url = pg_temp.ndcc_repoint_assets(t.image_url) WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0);
UPDATE public.player_sponsors t SET logo_url = pg_temp.ndcc_repoint_assets(t.logo_url) WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.logo_url, m.old_path) > 0);
UPDATE public.apparel_products t SET image_url = pg_temp.ndcc_repoint_assets(t.image_url) WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0);
UPDATE public.sponsors t SET logo_url = pg_temp.ndcc_repoint_assets(t.logo_url) WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.logo_url, m.old_path) > 0);
UPDATE public.calendar_events t SET image_url = pg_temp.ndcc_repoint_assets(t.image_url) WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0);
UPDATE public.events t SET image_url = pg_temp.ndcc_repoint_assets(t.image_url) WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0);
UPDATE public.content_blocks t SET image_url = pg_temp.ndcc_repoint_assets(t.image_url) WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0);
UPDATE public.gallery_images t SET image_url = pg_temp.ndcc_repoint_assets(t.image_url) WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0);
UPDATE public.publications t SET document_url = pg_temp.ndcc_repoint_assets(t.document_url) WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.document_url, m.old_path) > 0);
UPDATE public.teams t SET image_url = pg_temp.ndcc_repoint_assets(t.image_url) WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0);

ALTER TABLE public.events ENABLE TRIGGER sync_event_calendar;

-- 3. Remaining references to any old path (expect 0 in every row).
SELECT 'news.image_url' AS column_name, count(*) AS remaining_old_path_rows FROM public.news t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0)
UNION ALL
SELECT 'news.content' AS column_name, count(*) AS remaining_old_path_rows FROM public.news t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.content, m.old_path) > 0)
UNION ALL
SELECT 'season_appointments.image_url' AS column_name, count(*) AS remaining_old_path_rows FROM public.season_appointments t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0)
UNION ALL
SELECT 'player_sponsors.logo_url' AS column_name, count(*) AS remaining_old_path_rows FROM public.player_sponsors t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.logo_url, m.old_path) > 0)
UNION ALL
SELECT 'apparel_products.image_url' AS column_name, count(*) AS remaining_old_path_rows FROM public.apparel_products t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0)
UNION ALL
SELECT 'sponsors.logo_url' AS column_name, count(*) AS remaining_old_path_rows FROM public.sponsors t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.logo_url, m.old_path) > 0)
UNION ALL
SELECT 'calendar_events.image_url' AS column_name, count(*) AS remaining_old_path_rows FROM public.calendar_events t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0)
UNION ALL
SELECT 'events.image_url' AS column_name, count(*) AS remaining_old_path_rows FROM public.events t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0)
UNION ALL
SELECT 'content_blocks.image_url' AS column_name, count(*) AS remaining_old_path_rows FROM public.content_blocks t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0)
UNION ALL
SELECT 'gallery_images.image_url' AS column_name, count(*) AS remaining_old_path_rows FROM public.gallery_images t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0)
UNION ALL
SELECT 'publications.document_url' AS column_name, count(*) AS remaining_old_path_rows FROM public.publications t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.document_url, m.old_path) > 0)
UNION ALL
SELECT 'teams.image_url' AS column_name, count(*) AS remaining_old_path_rows FROM public.teams t WHERE EXISTS (SELECT 1 FROM ndcc_asset_path_map m WHERE strpos(t.image_url, m.old_path) > 0);

ROLLBACK;
-- Change ROLLBACK to COMMIT only after the dry run output has been reviewed.
