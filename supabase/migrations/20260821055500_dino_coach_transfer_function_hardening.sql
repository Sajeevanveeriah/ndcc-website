-- Recreate the two SECURITY DEFINER transfer-window functions with an empty
-- search path and fully-qualified references. The business rules are unchanged.
CREATE OR REPLACE FUNCTION public.dino_coach_transfer_window_open(
  target_season_id UUID,
  at_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  cfg public.fantasy_dino_settings%ROWTYPE;
  local_weekday INTEGER;
  local_minute INTEGER;
BEGIN
  SELECT * INTO cfg FROM public.fantasy_dino_settings WHERE season_id = target_season_id;
  IF NOT FOUND OR NOT cfg.team_selection_open OR NOT cfg.public_launch_enabled THEN RETURN FALSE; END IF;
  SELECT weekday, minute_of_day INTO local_weekday, local_minute
    FROM public.dino_coach_local_weekday_and_minute(at_time, cfg.transfer_timezone);
  RETURN (
    (local_weekday > cfg.transfer_open_weekday
      OR (local_weekday = cfg.transfer_open_weekday AND local_minute >= cfg.transfer_open_minute))
    AND
    (local_weekday < cfg.transfer_close_weekday
      OR (local_weekday = cfg.transfer_close_weekday AND local_minute < cfg.transfer_close_minute))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_dino_coach_transfer_window()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.fantasy_dino_settings WHERE season_id = NEW.season_id
  ) AND NOT public.dino_coach_transfer_window_open(NEW.season_id, COALESCE(NEW.created_at, NOW())) THEN
    RAISE EXCEPTION 'Dino Coach transfers are available Monday 09:00 to Saturday 11:00 Australia/Melbourne time.'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.penalty_points := 0;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dino_coach_transfer_window_open(UUID,TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_dino_coach_transfer_window() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dino_coach_transfer_window_open(UUID,TIMESTAMPTZ) TO service_role;
