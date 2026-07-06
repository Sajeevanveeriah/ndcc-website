-- Fantasy hardening: enforce one pre-season (NULL round) squad per manager.
--
-- UNIQUE(manager_id, round_id) on fantasy_squads does not constrain rows where
-- round_id IS NULL, so repeated squad saves before any round existed inserted a
-- new squad row per save. De-duplicate those rows (keeping the most recently
-- updated squad per manager), then add a partial unique index so it cannot
-- happen again. fantasy_squad_players.squad_id references fantasy_squads(id)
-- ON DELETE CASCADE (see 20260517143000_fantasy_playable_mvp.sql), so child
-- rows of deleted duplicates are removed automatically.
--
-- Idempotent: the delete matches nothing on re-run and the index is IF NOT EXISTS.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY manager_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM fantasy_squads
  WHERE round_id IS NULL
)
DELETE FROM fantasy_squads
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_squads_manager_null_round_uniq
ON fantasy_squads (manager_id)
WHERE round_id IS NULL;
