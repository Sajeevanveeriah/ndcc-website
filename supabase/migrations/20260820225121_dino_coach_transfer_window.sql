CREATE OR REPLACE FUNCTION dino_coach_local_weekday_and_minute(at_time TIMESTAMPTZ, timezone_name TEXT)
RETURNS TABLE(weekday INTEGER, minute_of_day INTEGER) LANGUAGE SQL STABLE SET search_path=public AS $$
  SELECT EXTRACT(ISODOW FROM at_time AT TIME ZONE timezone_name)::INTEGER,
    (EXTRACT(HOUR FROM at_time AT TIME ZONE timezone_name)::INTEGER*60 + EXTRACT(MINUTE FROM at_time AT TIME ZONE timezone_name)::INTEGER);
$$;
CREATE OR REPLACE FUNCTION dino_coach_transfer_window_open(target_season_id UUID, at_time TIMESTAMPTZ DEFAULT NOW())
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg fantasy_dino_settings%ROWTYPE; local_weekday INTEGER; local_minute INTEGER;
BEGIN
  SELECT * INTO cfg FROM fantasy_dino_settings WHERE season_id=target_season_id;
  IF NOT FOUND OR NOT cfg.team_selection_open OR NOT cfg.public_launch_enabled THEN RETURN FALSE; END IF;
  SELECT weekday,minute_of_day INTO local_weekday,local_minute FROM dino_coach_local_weekday_and_minute(at_time,cfg.transfer_timezone);
  RETURN ((local_weekday>cfg.transfer_open_weekday OR (local_weekday=cfg.transfer_open_weekday AND local_minute>=cfg.transfer_open_minute))
    AND (local_weekday<cfg.transfer_close_weekday OR (local_weekday=cfg.transfer_close_weekday AND local_minute<cfg.transfer_close_minute)));
END; $$;
REVOKE ALL ON FUNCTION dino_coach_transfer_window_open(UUID,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION enforce_dino_coach_transfer_window() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM fantasy_dino_settings WHERE season_id=NEW.season_id) AND NOT dino_coach_transfer_window_open(NEW.season_id,COALESCE(NEW.created_at,NOW())) THEN
    RAISE EXCEPTION 'Dino Coach transfers are available Monday 09:00 to Saturday 11:00 Australia/Melbourne time.' USING ERRCODE='check_violation';
  END IF;
  NEW.penalty_points:=0; RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_enforce_dino_coach_transfer_window ON fantasy_transfers;
CREATE TRIGGER trg_enforce_dino_coach_transfer_window BEFORE INSERT ON fantasy_transfers FOR EACH ROW EXECUTE FUNCTION enforce_dino_coach_transfer_window();
