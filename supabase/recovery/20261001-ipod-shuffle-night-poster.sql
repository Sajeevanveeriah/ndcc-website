-- Reviewed operator SQL: point the iPod Shuffle Night event at the 1 October 2026
-- poster (adds Beer Pong, spot prizes and bank transfer details).
--
-- Run ONLY after the deployment that ships
-- public/images/2026/10/20261001-ndcc-ipod-shuffle-night-rev00.webp is live;
-- before that the path would 404 on the event page, home page and calendar.
-- Check first: https://www.ndcc.com.au/images/2026/10/20261001-ndcc-ipod-shuffle-night-rev00.webp
--
-- This is a data fix, NOT a migration, so it stays out of supabase/migrations.
-- The event's title and description were updated in the CMS on 1 October 2026
-- (events.revision 5 -> 6); this file only changes the poster image.
--
-- The events -> calendar_events sync trigger copies the new events.image_url to
-- the linked calendar row, and editorial_revision_history archives the previous
-- events row, so the change is restorable from the admin revision history.
-- The guard on the previous image means a second run, or a run after someone
-- has already changed the poster in the CMS, matches no rows.
--
-- Usage: run as-is first (it ends in ROLLBACK) and expect one events row and one
-- calendar_events row in the output, then change ROLLBACK to COMMIT and run again.
-- Rollback after COMMIT: set events.image_url back to the previous URL below
-- (the sync trigger repoints the calendar row too), or restore the archived
-- revision from the admin history.

BEGIN;

UPDATE public.events
SET image_url = '/images/2026/10/20261001-ndcc-ipod-shuffle-night-rev00.webp'
WHERE id = '165d1b3b-5e79-488f-9d35-bed2cc108d08'
  AND image_url = 'https://alduwuipmmnzorcgkcli.supabase.co/storage/v1/object/public/cms-media/fb/fbcb3934d2013e10771ba3bf572461f66b964ceab9f334d1b7d46bf77000dda1.webp'
RETURNING id, title, revision, image_url;

SELECT id, title, image_url
FROM public.calendar_events
WHERE source_event_id = '165d1b3b-5e79-488f-9d35-bed2cc108d08';

ROLLBACK;
