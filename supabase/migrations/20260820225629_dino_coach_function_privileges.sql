REVOKE ALL ON FUNCTION dino_coach_local_weekday_and_minute(TIMESTAMPTZ,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION enforce_dino_coach_transfer_window() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION set_dino_coach_updated_at() FROM PUBLIC,anon,authenticated;
