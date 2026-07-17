-- RLS baseline capture (2026/27 season readiness).
--
-- Production has row level security ENABLED on every public table (verified
-- against pg_class.relrowsecurity on 2026-07-16), largely via ad-hoc
-- recovery work (rls_auto_enable) that was never captured in a committed
-- migration. Fresh replays (preview branches, CI bootstraps) therefore came
-- up LESS locked-down than production: the preview-branch security advisor
-- reported rls_disabled_in_public / policy_exists_rls_disabled errors that
-- production does not have.
--
-- This migration makes the lineage reproduce production's lockdown: enable
-- RLS on every public table that exists at this point. On production it is
-- a pure no-op. Read access is unaffected anywhere because the public-read
-- policies replay earlier in the lineage and the server uses the service
-- role.
--
-- Rollback: none needed on production (no-op). On a replay database,
-- ALTER TABLE ... DISABLE ROW LEVEL SECURITY per table if ever required.

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;
