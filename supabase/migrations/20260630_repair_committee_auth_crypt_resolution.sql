-- Superseded by 20260704_consolidate_committee_auth_canonical.sql - see that file for why.
-- Repair ndcc_verify_committee_user so Supabase resolves pgcrypto reliably.
-- Supabase commonly installs pgcrypto in the extensions schema. Use extensions.crypt
-- explicitly so credential checks do not depend on an unsafe or incomplete search_path.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.ndcc_verify_committee_user(
  p_email TEXT,
  p_password TEXT
)
RETURNS TABLE (id UUID, email TEXT, full_name TEXT, role TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT u.id, u.email, u.full_name, u.role
  FROM public.committee_users u
  WHERE lower(u.email) = lower(p_email)
    AND u.is_active = TRUE
    AND u.password_hash = extensions.crypt(p_password, u.password_hash)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.ndcc_verify_committee_user(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ndcc_verify_committee_user(TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
