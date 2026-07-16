-- History-alignment copy. This migration was applied directly to the remote
-- database (version 20260629045334) without a matching file in this
-- directory. The SQL below is recovered verbatim from
-- supabase_migrations.schema_migrations.statements. Do not edit and do not
-- re-apply manually: the remote history already records it as applied.

-- Lock down committee/admin SECURITY DEFINER RPCs so they are not exposed via anon/authenticated PostgREST calls.
-- The Next.js server uses the Supabase service role key for these admin operations.

REVOKE EXECUTE ON FUNCTION public.ndcc_verify_committee_user(TEXT, TEXT) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.ndcc_set_committee_password(UUID, TEXT) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.ndcc_admin_create_committee_user(TEXT, TEXT, TEXT, TEXT, UUID) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.ndcc_bootstrap_first_admin(TEXT, TEXT, TEXT) FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.ndcc_verify_committee_user(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.ndcc_set_committee_password(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.ndcc_admin_create_committee_user(TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
