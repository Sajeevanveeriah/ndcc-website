-- Reviewed operator SQL: publish the 2026 Dino Lotto winners on /winners from
-- the club's own winner posters (Drive folder Dino-Lotto-Raffle/Images).
--
-- Run ONLY after the deployment that ships public/images/2026/winners/*.webp is
-- live; before that the poster paths would 404 on /winners, /this-week and the
-- home page. Check first, e.g.:
-- https://www.ndcc.com.au/images/2026/winners/20261002-ndcc-dino-lotto-draw-10-rev00.webp
--
-- This is a data load, NOT a migration, so it stays out of supabase/migrations.
--
-- Source notes (the posters print the winning number and the winner; they do
-- not print a draw number, a date or a season):
-- * draw_date comes from the YYYYMMDD prefix of each poster's Drive filename.
-- * Draw numbers are chronological (one draw a week from 31 July 2026). The
--   Drive filenames number two different draws "Draw 6" (4 Sep: Kelsey Allan,
--   28; 11 Sep: Craig Hillgrove, 33), so the 11 Sep poster onwards is one higher
--   here than in its filename (11 Sep = Draw 7 ... 2 Oct = Draw 10).
-- * Draw 3 (filename 20260807-Draw-3-Winner-Rev03, last edited 14 Aug 2026)
--   reads "DINO LOTTO NO WINNER / TODAY'S NUNMER IS 15 / JACKPOT THIS WEEK!
--   NEXT WEEK'S WINNER WILL RECEIVE $200 - DOUBLE THE PRIZE!", so it has no row.
-- * Draw 1 reads only "TODAY'S WINNER IS NUMBER 16 / Congratulations TO NUMBER
--   16!" with no name, so its row is left commented out below for the committee
--   to complete; nothing is inferred from the number allocation list.
-- * Prize is filled only where the poster prints it (Draw 4: "WINNER RECEIVES
--   $200 THIS WEEK!"). season_label is empty because no poster names a season.
-- * show_full_name is false, so /winners shows first name + initial. The poster
--   images themselves print the full name; the committee should confirm that is
--   acceptable before publishing (or clear image_url on those rows).
--
-- The NOT EXISTS guard on (category, title, draw_date) means a second run, or a
-- run after someone has already entered the same draw in the admin, inserts
-- nothing for that draw.
--
-- Usage: run as-is first (it ends in ROLLBACK) and expect 8 rows returned
-- (fewer if some draws already exist), then change ROLLBACK to COMMIT and run
-- again.
-- Rollback after COMMIT: delete the rows this script added, or unpublish them in
-- /admin/winners:
--   DELETE FROM public.club_winners
--   WHERE category = 'dino_lotto'
--     AND image_url LIKE '/images/2026/winners/%-ndcc-dino-lotto-draw-%-rev00.webp';

BEGIN;

INSERT INTO public.club_winners
  (category, title, winner_name, show_full_name, prize, details, draw_date,
   season_label, image_url, image_alt, published, sort_order)
SELECT v.category, v.title, v.winner_name, false, v.prize, v.details, v.draw_date::date,
       '', v.image_url, v.image_alt, true, 0
FROM (VALUES
  -- Draw 1: poster names no winner (see notes). Uncomment once the committee
  -- supplies the name for number 16.
  -- ('dino_lotto', 'Dino Lotto Draw 1', '<name>', '', 'Winning number 16', '2026-07-31',
  --  '/images/2026/winners/20260731-ndcc-dino-lotto-draw-1-rev00.webp',
  --  'Dino Lotto Draw 1 winner poster: winning number 16, 31 July 2026'),
  ('dino_lotto', 'Dino Lotto Draw 2', 'Craig Wootton', '', 'Winning number 23', '2026-08-07',
   '/images/2026/winners/20260807-ndcc-dino-lotto-draw-2-rev00.webp',
   'Dino Lotto Draw 2 winner poster: Craig W., winning number 23, 7 August 2026'),
  ('dino_lotto', 'Dino Lotto Draw 4', 'Nobby Bell', '$200', 'Winning number 32', '2026-08-21',
   '/images/2026/winners/20260821-ndcc-dino-lotto-draw-4-rev00.webp',
   'Dino Lotto Draw 4 winner poster: Nobby B., winning number 32, $200 prize, 21 August 2026'),
  ('dino_lotto', 'Dino Lotto Draw 5', 'Champions Trophy', '', 'Winning number 1', '2026-08-28',
   '/images/2026/winners/20260828-ndcc-dino-lotto-draw-5-rev00.webp',
   'Dino Lotto Draw 5 winner poster: Champions T., winning number 1, 28 August 2026'),
  ('dino_lotto', 'Dino Lotto Draw 6', 'Kelsey Allan', '', 'Winning number 28', '2026-09-04',
   '/images/2026/winners/20260904-ndcc-dino-lotto-draw-6-rev00.webp',
   'Dino Lotto Draw 6 winner poster: Kelsey A., winning number 28, 4 September 2026'),
  ('dino_lotto', 'Dino Lotto Draw 7', 'Craig Hillgrove', '', 'Winning number 33', '2026-09-11',
   '/images/2026/winners/20260911-ndcc-dino-lotto-draw-7-rev00.webp',
   'Dino Lotto Draw 7 winner poster: Craig H., winning number 33, 11 September 2026'),
  ('dino_lotto', 'Dino Lotto Draw 8', 'Daniel Harrison', '', 'Winning number 18', '2026-09-18',
   '/images/2026/winners/20260918-ndcc-dino-lotto-draw-8-rev00.webp',
   'Dino Lotto Draw 8 winner poster: Daniel H., winning number 18, 18 September 2026'),
  ('dino_lotto', 'Dino Lotto Draw 9', 'Jodie Jones', '', 'Winning number 12', '2026-09-25',
   '/images/2026/winners/20260925-ndcc-dino-lotto-draw-9-rev00.webp',
   'Dino Lotto Draw 9 winner poster: Jodie J., winning number 12, 25 September 2026'),
  ('dino_lotto', 'Dino Lotto Draw 10', 'Rick McHutchison', '', 'Winning number 29', '2026-10-02',
   '/images/2026/winners/20261002-ndcc-dino-lotto-draw-10-rev00.webp',
   'Dino Lotto Draw 10 winner poster: Rick M., winning number 29, 2 October 2026')
) AS v (category, title, winner_name, prize, details, draw_date, image_url, image_alt)
WHERE NOT EXISTS (
  SELECT 1 FROM public.club_winners w
  WHERE w.category = v.category AND w.title = v.title AND w.draw_date = v.draw_date::date
)
RETURNING id, title, winner_name, prize, details, draw_date, image_url;

ROLLBACK;
