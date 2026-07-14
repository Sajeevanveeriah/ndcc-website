-- Sponsor logo presentation metadata (additive).
-- logo_surface_mode controls the inner logo plate behind the artwork:
--   auto        - deterministic default: known light-on-transparent artwork gets a
--                 dark plate, everything else a light plate (current behaviour).
--   light       - force a light plate (dark transparent artwork).
--   dark        - force a dark plate (white / very light transparent artwork).
--   neutral     - theme-following muted plate (artwork carries its own full
--                 coloured background).
--   transparent - no plate fill at all.
-- Existing rows backfill to 'auto' so nothing changes without admin action.
--
-- Rollback:
--   ALTER TABLE sponsors DROP COLUMN IF EXISTS logo_surface_mode;
--   ALTER TABLE sponsors DROP COLUMN IF EXISTS logo_padding;
--   ALTER TABLE sponsors DROP COLUMN IF EXISTS logo_object_position;

ALTER TABLE sponsors
  ADD COLUMN IF NOT EXISTS logo_surface_mode TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE sponsors
  ADD COLUMN IF NOT EXISTS logo_padding TEXT;

ALTER TABLE sponsors
  ADD COLUMN IF NOT EXISTS logo_object_position TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sponsors_logo_surface_mode_check'
  ) THEN
    ALTER TABLE sponsors
      ADD CONSTRAINT sponsors_logo_surface_mode_check
      CHECK (logo_surface_mode IN ('auto', 'light', 'dark', 'neutral', 'transparent'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
