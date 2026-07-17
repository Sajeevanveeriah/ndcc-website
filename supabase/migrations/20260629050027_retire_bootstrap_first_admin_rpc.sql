-- History-alignment copy. This migration was applied directly to the remote
-- database (version 20260629050027) without a matching file in this
-- directory. The SQL below is recovered verbatim from
-- supabase_migrations.schema_migrations.statements. Do not edit and do not
-- re-apply manually: the remote history already records it as applied.

-- First admin already exists; keep bootstrap closed after production recovery.
REVOKE EXECUTE ON FUNCTION public.ndcc_bootstrap_first_admin(TEXT, TEXT, TEXT) FROM service_role;
NOTIFY pgrst, 'reload schema';
