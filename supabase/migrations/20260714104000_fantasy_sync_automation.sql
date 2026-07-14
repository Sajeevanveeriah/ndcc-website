-- Fantasy PlayHQ sync automation support (additive):
--   1. Discovery provenance + automation flag on fantasy_seasons.
--   2. fantasy_sync_runs: orchestrator run audit / health trail.
--   3. fantasy_sync_locks + atomic acquire/release functions so concurrent
--      cron invocations can never run the orchestrator twice at once.
--
-- Rollback:
--   ALTER TABLE fantasy_seasons DROP COLUMN IF EXISTS playhq_discovery;
--   ALTER TABLE fantasy_seasons DROP COLUMN IF EXISTS playhq_linked_at;
--   ALTER TABLE fantasy_seasons DROP COLUMN IF EXISTS auto_sync_enabled;
--   ALTER TABLE fantasy_seasons DROP COLUMN IF EXISTS sync_exception;
--   DROP FUNCTION IF EXISTS acquire_fantasy_sync_lock(TEXT, TEXT, INTEGER);
--   DROP FUNCTION IF EXISTS release_fantasy_sync_lock(TEXT, TEXT);
--   DROP TABLE IF EXISTS fantasy_sync_locks;
--   DROP TABLE IF EXISTS fantasy_sync_runs;

ALTER TABLE fantasy_seasons
  ADD COLUMN IF NOT EXISTS playhq_discovery JSONB,
  ADD COLUMN IF NOT EXISTS playhq_linked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sync_exception TEXT;

-- Legacy CSV data must never be touched by the automation.
UPDATE fantasy_seasons SET auto_sync_enabled = FALSE WHERE slug = 'legacy-unverified';

CREATE TABLE IF NOT EXISTS fantasy_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoked_by TEXT NOT NULL DEFAULT 'cron',
  season_id UUID REFERENCES fantasy_seasons(id) ON DELETE SET NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'skipped', 'error', 'blocked')),
  detail JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fantasy_sync_runs_created_idx ON fantasy_sync_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS fantasy_sync_runs_season_idx ON fantasy_sync_runs (season_id, created_at DESC);

-- Server-only audit data: RLS enabled with no public policies; the app reads
-- it exclusively through the service-role client behind committee auth.
ALTER TABLE fantasy_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS fantasy_sync_locks (
  name TEXT PRIMARY KEY,
  locked_by TEXT,
  locked_until TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fantasy_sync_locks ENABLE ROW LEVEL SECURITY;

-- Atomic lease acquisition: succeeds when the lock is free, expired, or held
-- by the same holder (re-entrant renewal). Single statement => race-safe.
CREATE OR REPLACE FUNCTION acquire_fantasy_sync_lock(p_name TEXT, p_holder TEXT, p_ttl_seconds INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acquired BOOLEAN := FALSE;
BEGIN
  INSERT INTO fantasy_sync_locks AS l (name, locked_by, locked_until)
  VALUES (p_name, p_holder, NOW() + make_interval(secs => GREATEST(p_ttl_seconds, 5)))
  ON CONFLICT (name) DO UPDATE
    SET locked_by = EXCLUDED.locked_by,
        locked_until = EXCLUDED.locked_until
    WHERE l.locked_until < NOW() OR l.locked_by = EXCLUDED.locked_by
  RETURNING TRUE INTO acquired;
  RETURN COALESCE(acquired, FALSE);
END
$$;

CREATE OR REPLACE FUNCTION release_fantasy_sync_lock(p_name TEXT, p_holder TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE fantasy_sync_locks
  SET locked_until = NOW()
  WHERE name = p_name AND locked_by = p_holder;
$$;

REVOKE EXECUTE ON FUNCTION acquire_fantasy_sync_lock(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION release_fantasy_sync_lock(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acquire_fantasy_sync_lock(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION release_fantasy_sync_lock(TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
