-- Reviewed operator SQL for June 16 CMS recovery.
-- This file is intentionally non-destructive and is a transaction wrapper for
-- operator-reviewed INSERT/UPDATE statements generated from a June 16 evidence export.
-- Do not paste unreviewed data. Do not TRUNCATE, DELETE, reset seeds, or deactivate rows.

BEGIN;

-- 1. Create a point-in-time backup in SQL before applying reviewed statements.
-- Replace table names only with tables confirmed to exist in the target project.
CREATE TABLE IF NOT EXISTS cms_restore_backup_YYYYMMDDHHMM AS
SELECT 'sponsors' AS source_table, to_jsonb(sponsors.*) AS row_data FROM sponsors
UNION ALL SELECT 'content_blocks', to_jsonb(content_blocks.*) FROM content_blocks
UNION ALL SELECT 'page_link_cards', to_jsonb(page_link_cards.*) FROM page_link_cards
UNION ALL SELECT 'club_settings', to_jsonb(club_settings.*) FROM club_settings;

-- 2. Paste reviewed idempotent INSERT ... ON CONFLICT DO NOTHING statements for missing rows.
-- 3. Paste reviewed UPDATE statements that only fill NULL/blank/invalid fields, for example:
-- UPDATE sponsors
-- SET logo_url = evidence.logo_url
-- FROM (VALUES ('Known Sponsor', '/images/evidence-logo.webp')) AS evidence(name, logo_url)
-- WHERE sponsors.name = evidence.name
--   AND NULLIF(BTRIM(COALESCE(sponsors.logo_url, '')), '') IS NULL
--   AND NULLIF(BTRIM(evidence.logo_url), '') IS NOT NULL;

-- 4. Review counts in the same transaction before COMMIT.
-- SELECT COUNT(*) FROM sponsors WHERE active IS TRUE;

ROLLBACK;
-- Change ROLLBACK to COMMIT only after dry-run, backup, and operator review are complete.
