-- History-alignment copy. This migration was applied directly to the remote
-- database (version 20260629050722, recorded name
-- "20260629_lockdown_rls_auto_enable_rpc") without a matching file in this
-- directory. The SQL is recovered from
-- supabase_migrations.schema_migrations.statements; the existence guard was
-- added for fresh-database replays (rls_auto_enable() is a dashboard-era
-- function that only exists on production). The remote history already
-- records this version as applied.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
  end if;
end $$;
