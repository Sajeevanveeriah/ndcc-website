-- Reviewed operator SQL: publish the 2026 Dino Lotto winners on /winners from
-- the club's own winner posters (Drive folder Dino-Lotto-Raffle/Images).
--
-- Run ONLY after the deployment that ships public/images/2026/winners/*.webp is
-- live. Check first, e.g.:
-- https://www.ndcc.com.au/images/2026/winners/20261002-ndcc-dino-lotto-winner-rev00.webp
--
-- This is a data load, NOT a migration, so it stays out of supabase/migrations.
--
-- Sources:
-- * Winner names and winning numbers are as printed on each poster.
-- * The posters print no draw number, date or season. draw_date is the
--   YYYYMMDD prefix of each poster's Drive filename (one draw each Friday from
--   31 July 2026), and titles name the date rather than a draw number.
-- * The 31 July poster reads only "TODAY'S WINNER IS NUMBER 16"; the winner's
--   name comes from the club's number allocation list (Drive
--   20260731-Dino-Lotto-Rev00.docx, marked "Sensitivity - Public": "16. Karen
--   Elliott").
-- * 14 August (filename 20260807-Draw-3-Winner-Rev03) was a no-winner jackpot
--   draw ("DINO LOTTO NO WINNER / ... NEXT WEEK'S WINNER WILL RECEIVE $200"), so
--   it has no row. Prize is filled only where printed (21 August: $200).
-- * show_full_name is false (first name + initial) except Champions Trophy, a
--   business. The poster images, made by the club for publication, print the
--   full names.
--
-- The NOT EXISTS guard on (category, draw_date) means a re-run, or a run after
-- someone has already entered that draw in the admin, inserts nothing for it.
--
-- Usage: run as-is (ends in ROLLBACK), expect 9 rows, then change ROLLBACK to
-- COMMIT and run again.
-- Rollback after COMMIT:
--   DELETE FROM public.club_winners
--   WHERE category = 'dino_lotto'
--     AND image_url LIKE '/images/2026/winners/%-ndcc-dino-lotto-winner-rev00.webp';

BEGIN;

INSERT INTO public.club_winners
  (category, title, winner_name, show_full_name, prize, details, draw_date,
   season_label, image_url, image_alt, published, sort_order)
SELECT v.category, v.title, v.winner_name, v.show_full_name, v.prize, v.details, v.draw_date::date,
       '', v.image_url, v.image_alt, true, 0
FROM (VALUES
  ('dino_lotto', 'Dino Lotto draw - 31 July 2026', 'Karen Elliott', false, '', 'Winning number 16', '2026-07-31',
   '/images/2026/winners/20260731-ndcc-dino-lotto-winner-rev00.webp',
   'Dino Lotto winner poster: winning number 16, 31 July 2026'),
  ('dino_lotto', 'Dino Lotto draw - 7 August 2026', 'Craig Wootton', false, '', 'Winning number 23', '2026-08-07',
   '/images/2026/winners/20260807-ndcc-dino-lotto-winner-rev00.webp',
   'Dino Lotto winner poster: Craig W., winning number 23, 7 August 2026'),
  ('dino_lotto', 'Dino Lotto draw - 21 August 2026', 'Nobby Bell', false, '$200', 'Winning number 32', '2026-08-21',
   '/images/2026/winners/20260821-ndcc-dino-lotto-winner-rev00.webp',
   'Dino Lotto winner poster: Nobby B., winning number 32, $200 prize, 21 August 2026'),
  ('dino_lotto', 'Dino Lotto draw - 28 August 2026', 'Champions Trophy', true, '', 'Winning number 1', '2026-08-28',
   '/images/2026/winners/20260828-ndcc-dino-lotto-winner-rev00.webp',
   'Dino Lotto winner poster: Champions Trophy, winning number 1, 28 August 2026'),
  ('dino_lotto', 'Dino Lotto draw - 4 September 2026', 'Kelsey Allan', false, '', 'Winning number 28', '2026-09-04',
   '/images/2026/winners/20260904-ndcc-dino-lotto-winner-rev00.webp',
   'Dino Lotto winner poster: Kelsey A., winning number 28, 4 September 2026'),
  ('dino_lotto', 'Dino Lotto draw - 11 September 2026', 'Craig Hillgrove', false, '', 'Winning number 33', '2026-09-11',
   '/images/2026/winners/20260911-ndcc-dino-lotto-winner-rev00.webp',
   'Dino Lotto winner poster: Craig H., winning number 33, 11 September 2026'),
  ('dino_lotto', 'Dino Lotto draw - 18 September 2026', 'Daniel Harrison', false, '', 'Winning number 18', '2026-09-18',
   '/images/2026/winners/20260918-ndcc-dino-lotto-winner-rev00.webp',
   'Dino Lotto winner poster: Daniel H., winning number 18, 18 September 2026'),
  ('dino_lotto', 'Dino Lotto draw - 25 September 2026', 'Jodie Jones', false, '', 'Winning number 12', '2026-09-25',
   '/images/2026/winners/20260925-ndcc-dino-lotto-winner-rev00.webp',
   'Dino Lotto winner poster: Jodie J., winning number 12, 25 September 2026'),
  ('dino_lotto', 'Dino Lotto draw - 2 October 2026', 'Rick McHutchison', false, '', 'Winning number 29', '2026-10-02',
   '/images/2026/winners/20261002-ndcc-dino-lotto-winner-rev00.webp',
   'Dino Lotto winner poster: Rick M., winning number 29, 2 October 2026')
) AS v (category, title, winner_name, show_full_name, prize, details, draw_date, image_url, image_alt)
WHERE NOT EXISTS (
  SELECT 1 FROM public.club_winners w
  WHERE w.category = v.category AND w.draw_date = v.draw_date::date
)
RETURNING id, title, winner_name, prize, details, draw_date, image_url;

ROLLBACK;
