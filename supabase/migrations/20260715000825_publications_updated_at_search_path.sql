-- History-alignment copy. This migration was applied directly to the remote
-- database (version 20260715000825) without a matching file in this
-- directory. The SQL below is recovered verbatim from
-- supabase_migrations.schema_migrations.statements. Do not edit and do not
-- re-apply manually: the remote history already records it as applied.

-- Pin search_path on the publications updated_at trigger function
-- (security-linter hygiene for the newly added function only).
CREATE OR REPLACE FUNCTION set_publications_updated_at()
RETURNS TRIGGER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
