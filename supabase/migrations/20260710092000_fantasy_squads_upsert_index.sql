-- PostgREST upsert (onConflict manager_id,season_id,round_id) cannot infer a
-- partial unique index. Replace with a full unique index; NULL round_id rows
-- remain governed by the (manager_id, season_id) WHERE round_id IS NULL index.
DROP INDEX IF EXISTS fantasy_squads_manager_season_round_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS fantasy_squads_manager_season_round_uniq
  ON fantasy_squads (manager_id, season_id, round_id);
