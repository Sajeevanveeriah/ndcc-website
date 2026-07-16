-- History-alignment copy. This migration was applied directly to the remote
-- database (version 20260629050722, recorded name
-- "20260629_lockdown_rls_auto_enable_rpc") without a matching file in this
-- directory. The SQL below is recovered verbatim from
-- supabase_migrations.schema_migrations.statements. Do not edit and do not
-- re-apply manually: the remote history already records it as applied.

revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
