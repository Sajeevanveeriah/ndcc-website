-- History-alignment copy. This migration was applied directly to the remote
-- database (version 20260629050200, recorded name
-- "20260629_lockdown_committee_auth_rpc") without a matching file in this
-- directory. It re-applied the same lockdown as version 20260629045334 during
-- the June 29 recovery session. The SQL below is recovered verbatim from
-- supabase_migrations.schema_migrations.statements. Do not edit and do not
-- re-apply manually: the remote history already records it as applied.

revoke execute on function public.ndcc_verify_committee_user(text, text) from anon, authenticated, public;
revoke execute on function public.ndcc_set_committee_password(uuid, text) from anon, authenticated, public;
revoke execute on function public.ndcc_admin_create_committee_user(text, text, text, text, uuid) from anon, authenticated, public;
revoke execute on function public.ndcc_bootstrap_first_admin(text, text, text) from anon, authenticated, public;

grant execute on function public.ndcc_verify_committee_user(text, text) to service_role;
grant execute on function public.ndcc_set_committee_password(uuid, text) to service_role;
grant execute on function public.ndcc_admin_create_committee_user(text, text, text, text, uuid) to service_role;
