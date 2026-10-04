-- Stale CMS and import cleanup, approved by Saj on 4 October 2026
-- ("remove the stale items except anything with orders").
--
-- Removes: 18 unpublished news drafts; 2 past events with no registrations or
-- orders (Practice Match, Season Launch 2026/27) and the 2 calendar entries
-- that only link to them; 2 closed merch windows with no orders; the ended
-- cookie-dough promotion; 2 inactive sponsors with no player sponsorship; the
-- unused draft fantasy season "NDCC Fantasy Summer 2026/27" (its only child
-- row is its settings row); 26 PlayHQ import batches that never published
-- stats (25 rejected, 1 draft) and the 2 stale sync jobs (needs_review from
-- 16 July for the completed 2025/26 season, cancelled from 15 September);
-- expired committee login sessions; the 23 September image-repoint backup
-- table, whose repoint has been live since then.
--
-- Kept on purpose: anything with orders or registrations (AFL Grand Final
-- Sweep, iPod Shuffle Night, the Initial Order merch window), East Geelong
-- Quality Butchers (active player sponsorship), the Legacy / Unverified
-- fantasy season (required by /admin/fantasy/reconciliation), the one
-- published import batch and all completed sync jobs and runs.
--
-- Every removed row except the expired sessions is copied first to
-- archive.stale_cleanup_20261004. The archive schema is not exposed to the
-- website API. Drop it after 2026-11-04 if nothing needs restoring:
--   DROP SCHEMA archive CASCADE;
--
-- Rollback, parents before children (fantasy_seasons before fantasy_settings,
-- events before calendar_events, fantasy_import_batches before the job links):
--   INSERT INTO public.<table>
--   SELECT (jsonb_populate_record(NULL::public.<table>, row_data)).*
--   FROM archive.stale_cleanup_20261004 WHERE source_table = '<table>';
-- Re-link completed sync jobs to their restored batches:
--   UPDATE public.fantasy_sync_jobs j SET import_batch_id = (a.row_data->>'import_batch_id')::uuid
--   FROM archive.stale_cleanup_20261004 a
--   WHERE a.source_table = 'fantasy_sync_jobs.import_batch_id' AND j.id = (a.row_data->>'id')::uuid;
-- Restore the image backup table:
--   CREATE TABLE public.asset_repoint_backup_20260923 AS
--   SELECT (row_data->>'source_table') AS source_table, (row_data->>'source_column') AS source_column,
--          (row_data->'row_data') AS row_data, (row_data->>'backed_up_at')::timestamptz AS backed_up_at
--   FROM archive.stale_cleanup_20261004 WHERE source_table = 'asset_repoint_backup_20260923';
BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE SCHEMA IF NOT EXISTS archive;
REVOKE ALL ON SCHEMA archive FROM PUBLIC, anon, authenticated;
CREATE TABLE archive.stale_cleanup_20261004 (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_table text NOT NULL,
  row_data jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON archive.stale_cleanup_20261004 FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  n integer;
  news_ids uuid[] := ARRAY[
    'dcf48ea9-1f4a-4ba5-954a-d7bb2850227d','6523a426-413f-4af3-a5c6-78fa7a030731','1edf013e-217b-45d6-807f-e736cfb78246',
    '584c4cab-7a3e-454d-b4fe-2cb5c7bfcd2d','95c0bde6-9230-4767-b1e1-a65fb32a1454','81f07872-a133-480e-a292-771fe6a502a2',
    '47ac5c99-2781-4af1-bc6d-9dff339e3790','9fc03062-1e56-47ed-a3a1-60cca078c73a','88eb10a0-dcfa-49ba-be41-74dafb80d98c',
    'dfb1db6a-8ec3-41c7-a923-a4f235e0c57c','b17cdb0a-8cbb-4e58-994a-0b7dd1c15a37','d30e98c6-2e01-4321-8f1f-79d08c4f1e9c',
    '8388a7fb-596c-483a-a442-85cbac8691ab','1d064875-0119-4c79-9a01-a3991d99c65d','6a357eeb-7700-4f69-88f9-30c1615529cb',
    '9c064891-c9fd-4f29-a012-9b36db3dba98','00377e3e-9494-46d5-949f-ccc8438bb37d','500f7826-2860-4734-9942-31860175dfa6'
  ]::uuid[];
  event_ids uuid[] := ARRAY['c19dd4f0-ddd5-4c9d-b5b2-77f95362305d','52c1e05f-aaea-49b5-9e1c-bbc128720ceb']::uuid[];
  window_ids uuid[] := ARRAY['728d3d81-df24-46c2-8247-d2b4057428ad','29bb22d8-2351-4965-99fe-7c93be156b1b']::uuid[];
  promotion_ids uuid[] := ARRAY['bda24459-1dd2-47c2-b81d-8b95b1a9c641']::uuid[];
  sponsor_ids uuid[] := ARRAY['4312e579-5ad3-4f0c-a632-db2ee8fa62f9','81af4a3e-4bf8-4ba3-8700-415003977abb']::uuid[];
  season_ids uuid[] := ARRAY['e4a9f9ba-48ca-403e-835b-a668ea96bf80']::uuid[];
  batch_ids uuid[] := ARRAY[
    '1e31ca62-22ac-4a6a-80f5-587136a7fae6','1ba38b2c-7af9-4337-bbdd-0bd5f2832315','ee2fed4f-b8db-4f54-92ad-128434028732',
    '0e4c533e-931b-4121-8567-de6d5e4af950','6ad857ff-568b-40ac-958b-1c36fbfa36a9','7d1f4282-879c-4ccd-a03b-c9b2c14f26a1',
    'e682f368-c719-466d-b71e-a62984eb3de9','79d944ea-31a0-4d61-a992-514c398da7da','c591da46-1467-4231-b989-ceeb96bd12fe',
    'fde7a571-63bc-42f5-8fb7-d40b590bc4d7','2d8b82db-3c17-4256-bfe7-c6e292ba9326','548fc03f-b32b-4be9-a0eb-a8cc66039378',
    '63ef46dd-f369-48fd-9f10-c8c5d3050475','01e1898d-6d21-4d5c-b23e-32e065aece0e','0c776411-d89d-4b65-b1f2-1b94d0e317a2',
    '3ecbe938-092a-4bdd-95c4-387beeb25358','1c985b89-1963-408e-8144-9dd03780292a','92edaa52-167f-425f-b8f0-ebef861e71fa',
    '73f298ae-2147-4eeb-8bca-61d1731b5803','5fd47094-1296-4ac8-8925-f6cfbda04d57','0fc877bc-4cca-4f78-84b9-dfe4f5280d21',
    'c7584f0a-5ddb-4d83-ac65-f26921b846f0','40fba354-862f-4a4e-9f92-ca36ffeb0e49','03502deb-5ed4-4ca3-84f9-b913001e788a',
    '3152537b-9db1-4fe1-a1e5-f6d3842450f0','b9488f44-b603-4e83-b0c2-3ee863132d1a'
  ]::uuid[];
  job_ids uuid[] := ARRAY['6c570299-8629-48cb-9e40-89c797d453bc','ae97079f-e327-4072-a5e0-e568b2049aa5']::uuid[];
BEGIN
  -- Guards: stop if anything picked up orders, registrations, published
  -- status, stats or season activity since it was reviewed.
  IF EXISTS (SELECT 1 FROM public.news WHERE id = ANY(news_ids) AND published) THEN
    RAISE EXCEPTION 'A news draft has been published; review before cleanup.'; END IF;
  IF EXISTS (SELECT 1 FROM public.event_registrations WHERE event_id = ANY(event_ids)) THEN
    RAISE EXCEPTION 'A past event now has registrations; review before cleanup.'; END IF;
  IF EXISTS (SELECT 1 FROM public.orders o, unnest(event_ids) e WHERE o.items::text LIKE '%' || e::text || '%') THEN
    RAISE EXCEPTION 'A past event now has orders; review before cleanup.'; END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE merch_window_id = ANY(window_ids)) THEN
    RAISE EXCEPTION 'A closed merch window now has orders; review before cleanup.'; END IF;
  IF EXISTS (SELECT 1 FROM public.merch_order_windows WHERE id = ANY(window_ids) AND close_date >= now()) THEN
    RAISE EXCEPTION 'A merch window is open again; review before cleanup.'; END IF;
  IF EXISTS (SELECT 1 FROM public.site_promotions WHERE id = ANY(promotion_ids) AND ends_at >= now()) THEN
    RAISE EXCEPTION 'The cookie-dough promotion was extended; review before cleanup.'; END IF;
  IF EXISTS (SELECT 1 FROM public.sponsors WHERE id = ANY(sponsor_ids) AND active) THEN
    RAISE EXCEPTION 'A sponsor was reactivated; review before cleanup.'; END IF;
  IF EXISTS (SELECT 1 FROM public.fantasy_seasons WHERE id = ANY(season_ids) AND (status <> 'draft' OR is_current)) THEN
    RAISE EXCEPTION 'The draft fantasy season was activated; review before cleanup.'; END IF;
  IF EXISTS (SELECT 1 FROM public.fantasy_entries WHERE season_id = ANY(season_ids))
     OR EXISTS (SELECT 1 FROM public.fantasy_squads WHERE season_id = ANY(season_ids))
     OR EXISTS (SELECT 1 FROM public.fantasy_rounds WHERE season_id = ANY(season_ids))
     OR EXISTS (SELECT 1 FROM public.fantasy_season_players WHERE season_id = ANY(season_ids))
     OR EXISTS (SELECT 1 FROM public.fantasy_match_stats WHERE season_id = ANY(season_ids))
     OR EXISTS (SELECT 1 FROM public.fantasy_import_batches WHERE season_id = ANY(season_ids))
     OR EXISTS (SELECT 1 FROM public.fantasy_sync_jobs WHERE season_id = ANY(season_ids)) THEN
    RAISE EXCEPTION 'The draft fantasy season has season data; review before cleanup.'; END IF;
  IF EXISTS (SELECT 1 FROM public.fantasy_match_stats WHERE import_batch_id = ANY(batch_ids)) THEN
    RAISE EXCEPTION 'An import batch to remove is linked to match stats; review before cleanup.'; END IF;
  IF EXISTS (SELECT 1 FROM public.fantasy_import_batches WHERE id = ANY(batch_ids) AND status NOT IN ('rejected', 'draft')) THEN
    RAISE EXCEPTION 'An import batch to remove has been published; review before cleanup.'; END IF;

  WITH d AS (DELETE FROM public.news WHERE id = ANY(news_ids) RETURNING *)
  INSERT INTO archive.stale_cleanup_20261004 (source_table, row_data) SELECT 'news', to_jsonb(d) FROM d;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 18 THEN RAISE EXCEPTION 'news: expected 18 rows, found %', n; END IF;

  WITH d AS (DELETE FROM public.calendar_events WHERE source_event_id = ANY(event_ids) RETURNING *)
  INSERT INTO archive.stale_cleanup_20261004 (source_table, row_data) SELECT 'calendar_events', to_jsonb(d) FROM d;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'calendar_events: expected 2 rows, found %', n; END IF;

  WITH d AS (DELETE FROM public.events WHERE id = ANY(event_ids) RETURNING *)
  INSERT INTO archive.stale_cleanup_20261004 (source_table, row_data) SELECT 'events', to_jsonb(d) FROM d;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'events: expected 2 rows, found %', n; END IF;

  WITH d AS (DELETE FROM public.merch_order_windows WHERE id = ANY(window_ids) RETURNING *)
  INSERT INTO archive.stale_cleanup_20261004 (source_table, row_data) SELECT 'merch_order_windows', to_jsonb(d) FROM d;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'merch_order_windows: expected 2 rows, found %', n; END IF;

  WITH d AS (DELETE FROM public.site_promotions WHERE id = ANY(promotion_ids) RETURNING *)
  INSERT INTO archive.stale_cleanup_20261004 (source_table, row_data) SELECT 'site_promotions', to_jsonb(d) FROM d;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'site_promotions: expected 1 row, found %', n; END IF;

  WITH d AS (DELETE FROM public.sponsors WHERE id = ANY(sponsor_ids) RETURNING *)
  INSERT INTO archive.stale_cleanup_20261004 (source_table, row_data) SELECT 'sponsors', to_jsonb(d) FROM d;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'sponsors: expected 2 rows, found %', n; END IF;

  -- The season delete cascades to its settings row, so archive that first.
  INSERT INTO archive.stale_cleanup_20261004 (source_table, row_data)
  SELECT 'fantasy_settings', to_jsonb(s) FROM public.fantasy_settings s WHERE s.season_id = ANY(season_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'fantasy_settings: expected 1 row, found %', n; END IF;

  WITH d AS (DELETE FROM public.fantasy_seasons WHERE id = ANY(season_ids) RETURNING *)
  INSERT INTO archive.stale_cleanup_20261004 (source_table, row_data) SELECT 'fantasy_seasons', to_jsonb(d) FROM d;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'fantasy_seasons: expected 1 row, found %', n; END IF;

  WITH d AS (DELETE FROM public.fantasy_sync_jobs WHERE id = ANY(job_ids) RETURNING *)
  INSERT INTO archive.stale_cleanup_20261004 (source_table, row_data) SELECT 'fantasy_sync_jobs', to_jsonb(d) FROM d;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'fantasy_sync_jobs: expected 2 rows, found %', n; END IF;

  -- Completed sync jobs keep their run history; record which removed batch
  -- each one pointed at before the foreign key sets it to null.
  INSERT INTO archive.stale_cleanup_20261004 (source_table, row_data)
  SELECT 'fantasy_sync_jobs.import_batch_id', jsonb_build_object('id', j.id, 'import_batch_id', j.import_batch_id)
  FROM public.fantasy_sync_jobs j WHERE j.import_batch_id = ANY(batch_ids);

  WITH d AS (DELETE FROM public.fantasy_import_batches WHERE id = ANY(batch_ids) RETURNING *)
  INSERT INTO archive.stale_cleanup_20261004 (source_table, row_data) SELECT 'fantasy_import_batches', to_jsonb(d) FROM d;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 26 THEN RAISE EXCEPTION 'fantasy_import_batches: expected 26 rows, found %', n; END IF;

  -- Expired sessions can no longer sign anyone in; nothing to archive.
  DELETE FROM public.committee_sessions WHERE expires_at < now();

  INSERT INTO archive.stale_cleanup_20261004 (source_table, row_data)
  SELECT 'asset_repoint_backup_20260923', to_jsonb(b) FROM public.asset_repoint_backup_20260923 b;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 66 THEN RAISE EXCEPTION 'asset_repoint_backup_20260923: expected 66 rows, found %', n; END IF;
END;
$$;

DROP TABLE public.asset_repoint_backup_20260923;

COMMIT;
