-- fantasy_rounds.season_id is NOT NULL; existing admin tooling (generic
-- resources route) creates rounds without a season, so default new rounds to
-- the current season when none is supplied.
CREATE OR REPLACE FUNCTION fantasy_default_round_season()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.season_id IS NULL THEN
    SELECT id INTO NEW.season_id FROM fantasy_seasons WHERE is_current LIMIT 1;
  END IF;
  IF NEW.season_id IS NULL THEN
    RAISE EXCEPTION 'No current fantasy season is set; supply season_id explicitly.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fantasy_rounds_default_season ON fantasy_rounds;
CREATE TRIGGER trg_fantasy_rounds_default_season
BEFORE INSERT ON fantasy_rounds
FOR EACH ROW EXECUTE FUNCTION fantasy_default_round_season();
