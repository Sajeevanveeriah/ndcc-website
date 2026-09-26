-- D3: opt-in Melbourne-time deadline editor. Existing behaviour remains the default.
-- Apply and confirm this migration in production before merging its reader code.
-- Rollback: first disable the switch and reload any open deadline editors:
-- UPDATE public.club_settings SET fantasy_melbourne_deadlines_enabled = false WHERE id = 'default';
-- After reverting the reader code, the additive column may be removed:
-- ALTER TABLE public.club_settings DROP COLUMN IF EXISTS fantasy_melbourne_deadlines_enabled;

ALTER TABLE public.club_settings
  ADD COLUMN IF NOT EXISTS fantasy_melbourne_deadlines_enabled boolean DEFAULT false;
