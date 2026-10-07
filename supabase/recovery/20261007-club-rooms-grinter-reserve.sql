-- Reviewed operator SQL: name the Club Rooms venue in full on the six upcoming
-- events held there, so the event pages, home page and calendar all read
-- "Club Rooms, Grinter Reserve". The Club Rooms are at Grinter Reserve
-- (confirmed by the club, 7 October 2026).
--
-- This is a data fix, NOT a migration, so it stays out of supabase/migrations.
-- Safe to run before or after the deployment that teaches lib/event-venue.ts the
-- new name: until that deploys the pages simply show the name without the
-- street address, exactly as "Club Rooms" does today.
--
-- The events -> calendar_events sync trigger copies the new location to each
-- linked calendar row, and editorial_revision_history archives the previous
-- events row, so the change is restorable from the admin revision history.
-- The guard on the previous location means a second run, or a run after someone
-- has already edited the venue in the CMS, matches no rows.
--
-- Applied 7 October 2026 (16:15 AEDT): six events rows and six calendar rows
-- now read "Club Rooms, Grinter Reserve". Kept as the reviewed record and the
-- rollback reference; a re-run matches no rows.
--
-- Usage: run as-is first (it ends in ROLLBACK) and expect six events rows and
-- six calendar_events rows in the output, then change ROLLBACK to COMMIT and run again.
-- Rollback after COMMIT: run the same UPDATE with the two location values
-- swapped (the sync trigger repoints the calendar rows too), or restore the
-- archived revisions from the admin history.

BEGIN;

UPDATE public.events
SET location = 'Club Rooms, Grinter Reserve'
WHERE id IN (
    'eb07061f-bb90-473b-904d-0ccf46a7aff6', -- Snail Racing, 24 Oct 2026
    'c272733d-3461-4777-af01-3d4ab6d4fef7', -- Halloween, 31 Oct 2026
    'd1b83000-8a0c-464c-a551-ffe8624b9fc2', -- Trivia Night, 14 Nov 2026
    'a371da45-0bf8-4e13-9020-f09e4e399676', -- Christmas Party, 19 Dec 2026
    'fbdecb31-c747-454e-8f77-9e31e24e157a', -- Reverse Draw, 23 Jan 2027
    '395e0b01-0ce9-4170-80bd-8af0f884fd00'  -- Karaoke Night, 6 Feb 2027
  )
  AND location = 'Club Rooms'
RETURNING id, title, revision, location;

SELECT id, title, location
FROM public.calendar_events
WHERE source_event_id IN (
    'eb07061f-bb90-473b-904d-0ccf46a7aff6', 'c272733d-3461-4777-af01-3d4ab6d4fef7',
    'd1b83000-8a0c-464c-a551-ffe8624b9fc2', 'a371da45-0bf8-4e13-9020-f09e4e399676',
    'fbdecb31-c747-454e-8f77-9e31e24e157a', '395e0b01-0ce9-4170-80bd-8af0f884fd00'
  )
ORDER BY start_at;

ROLLBACK;
