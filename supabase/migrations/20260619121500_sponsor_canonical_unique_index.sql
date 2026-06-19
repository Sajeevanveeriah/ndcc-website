-- Mirrors the production sponsor closeout schema change for Supabase Git integration.
-- Idempotent and non-destructive: adds optional metadata columns and enforces the
-- production case-insensitive sponsor-name uniqueness guard.
ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS logo_source_url TEXT;
ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS sponsors_name_case_insensitive_unique
  ON sponsors (LOWER(BTRIM(name)));
