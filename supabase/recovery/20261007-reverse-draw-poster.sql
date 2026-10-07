-- Reviewed operator SQL: give the Reverse Draw event its own poster. It showed
-- the Karaoke Night artwork from 15 September 2026 until that image was cleared
-- in the CMS on 7 October 2026 (events revision 4); it has had no image since.
--
-- Run ONLY after the deployment that ships
-- public/images/2026/10/20261007-ndcc-reverse-draw-rev00.webp is live;
-- before that the path would 404 on the event page, home page and calendar.
-- Check first: https://www.ndcc.com.au/images/2026/10/20261007-ndcc-reverse-draw-rev00.webp
--
-- This is a data fix, NOT a migration, so it stays out of supabase/migrations.
-- The events -> calendar_events sync trigger copies the new events.image_url to
-- the linked calendar row, and editorial_revision_history archives the previous
-- events row, so the change is restorable from the admin revision history.
-- The guard (no image, or the old Karaoke Night image) means a second run, or a
-- run after someone has already set a different poster in the CMS, matches no rows.
--
-- Usage: run as-is first (it ends in ROLLBACK) and expect one events row and one
-- calendar_events row in the output, then change ROLLBACK to COMMIT and run again.
-- Rollback after COMMIT: set events.image_url back to NULL
-- (the sync trigger clears the calendar row too), or restore the archived
-- revision from the admin history.

BEGIN;

UPDATE public.events
SET image_url = '/images/2026/10/20261007-ndcc-reverse-draw-rev00.webp'
WHERE id = 'fbdecb31-c747-454e-8f77-9e31e24e157a'
  AND (image_url IS NULL
       OR image_url = '/images/2026/09/20260915-ndcc-karaoke-night-rev00-1789431875042.webp')
RETURNING id, title, revision, image_url;

SELECT id, title, image_url
FROM public.calendar_events
WHERE source_event_id = 'fbdecb31-c747-454e-8f77-9e31e24e157a';

ROLLBACK;
