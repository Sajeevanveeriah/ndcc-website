-- Import provenance for fantasy stat batches: where the stats came from and
-- when they were fetched/recorded. Additive and idempotent; existing rows keep
-- NULL source_url and their created_at-era fetched_at stays unset.
ALTER TABLE fantasy_import_batches
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ;
