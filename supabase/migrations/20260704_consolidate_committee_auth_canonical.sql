-- Canonical, final definition of the committee auth functions.
-- Supersedes 20260630_repair_committee_auth_crypt_resolution.sql,
-- 20260630_repair_committee_auth_pgcrypto.sql, and the auth-function
-- portion of 20260630_repair_core_schema_dependencies.sql, which
-- redefined this same function three times in one day and left the
-- unqualified `crypt(...)` form (relying on function-level search_path)
-- as the live version. This migration makes the schema-qualified form
-- the single source of truth so no future session re-introduces the
-- ambiguity. Idempotent and non-destructive: no data is touched.

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

CREATE OR REPLACE FUNCTION public.ndcc_set_committee_password(p_user_id UUID, p_password TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  UPDATE public.committee_users
  SET password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
      updated_at = NOW()
  WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.ndcc_admin_create_committee_user(
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_password TEXT,
  p_created_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_user_id UUID;
  creator_role TEXT;
BEGIN
  SELECT u.role INTO creator_role
  FROM public.committee_users u
  WHERE u.id = p_created_by AND u.is_active = TRUE;

  IF creator_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can create committee users';
  END IF;

  INSERT INTO public.committee_users(email, full_name, password_hash, role)
  VALUES (lower(trim(p_email)), trim(p_full_name), extensions.crypt(p_password, extensions.gen_salt('bf', 10)), p_role)
  RETURNING committee_users.id INTO new_user_id;

  RETURN new_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ndcc_bootstrap_first_admin(
  p_email TEXT,
  p_full_name TEXT,
  p_password TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  existing_admins INTEGER;
  new_user_id UUID;
BEGIN
  SELECT count(*)::int INTO existing_admins
  FROM public.committee_users u
  WHERE u.role = 'admin' AND u.is_active = TRUE;

  IF existing_admins > 0 THEN
    RAISE EXCEPTION 'Bootstrap disabled: an active admin already exists';
  END IF;

  INSERT INTO public.committee_users(email, full_name, password_hash, role)
  VALUES (lower(trim(p_email)), trim(p_full_name), extensions.crypt(p_password, extensions.gen_salt('bf', 10)), 'admin')
  RETURNING committee_users.id INTO new_user_id;

  RETURN new_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ndcc_verify_committee_user(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ndcc_set_committee_password(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ndcc_admin_create_committee_user(TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ndcc_bootstrap_first_admin(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ndcc_verify_committee_user(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.ndcc_set_committee_password(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.ndcc_admin_create_committee_user(TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.ndcc_bootstrap_first_admin(TEXT, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
