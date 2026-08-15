-- CMS-friendly sponsor motion and season-aware appointment visibility.
-- Rollback:
--   ALTER TABLE club_settings DROP COLUMN IF EXISTS sponsor_marquee_speed;
--   ALTER TABLE club_seasons DROP COLUMN IF EXISTS show_season_appointments;

ALTER TABLE club_settings
  ADD COLUMN IF NOT EXISTS sponsor_marquee_speed TEXT NOT NULL DEFAULT 'slow'
  CHECK (sponsor_marquee_speed IN ('slow', 'very_slow'));

ALTER TABLE club_seasons
  ADD COLUMN IF NOT EXISTS show_season_appointments BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE club_seasons
SET show_season_appointments = FALSE
WHERE slug = '2026-27';

NOTIFY pgrst, 'reload schema';
