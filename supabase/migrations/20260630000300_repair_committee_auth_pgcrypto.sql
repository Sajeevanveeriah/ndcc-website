-- Superseded by 20260704_consolidate_committee_auth_canonical.sql - see that file for why.
-- Repair custom committee auth schema and pgcrypto resolution.
-- Safe/idempotent: creates missing auth tables, columns, indexes, RLS policies, and functions.
-- Does not insert passwords, delete data or remove existing data.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.committee_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'president', 'secretary', 'committee')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.committee_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.committee_users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.committee_users ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.committee_users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.committee_users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.committee_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE public.committee_users ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE public.committee_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.committee_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.committee_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.committee_sessions ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.committee_sessions ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.committee_sessions ADD COLUMN IF NOT EXISTS session_token_hash TEXT;
ALTER TABLE public.committee_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.committee_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_committee_users_email ON public.committee_users (email);
CREATE INDEX IF NOT EXISTS idx_committee_users_lower_email ON public.committee_users (lower(email));
CREATE INDEX IF NOT EXISTS idx_committee_sessions_user_id ON public.committee_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_committee_sessions_expires_at ON public.committee_sessions (expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_committee_sessions_token_hash_unique ON public.committee_sessions (session_token_hash);

ALTER TABLE public.committee_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct public access to committee_users" ON public.committee_users;
CREATE POLICY "No direct public access to committee_users" ON public.committee_users
  FOR ALL USING (FALSE) WITH CHECK (FALSE);

DROP POLICY IF EXISTS "No direct public access to committee_sessions" ON public.committee_sessions;
CREATE POLICY "No direct public access to committee_sessions" ON public.committee_sessions
  FOR ALL USING (FALSE) WITH CHECK (FALSE);

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
    AND u.password_hash = crypt(p_password, u.password_hash)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.ndcc_set_committee_password(p_user_id UUID, p_password TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  UPDATE public.committee_users
  SET password_hash = crypt(p_password, gen_salt('bf', 10)),
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
  WHERE u.id = p_created_by
    AND u.is_active = TRUE;

  IF creator_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can create committee users';
  END IF;

  INSERT INTO public.committee_users(email, full_name, password_hash, role)
  VALUES (
    lower(trim(p_email)),
    trim(p_full_name),
    crypt(p_password, gen_salt('bf', 10)),
    p_role
  )
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
  WHERE u.role = 'admin'
    AND u.is_active = TRUE;

  IF existing_admins > 0 THEN
    RAISE EXCEPTION 'Bootstrap disabled: an active admin already exists';
  END IF;

  INSERT INTO public.committee_users(email, full_name, password_hash, role)
  VALUES (
    lower(trim(p_email)),
    trim(p_full_name),
    crypt(p_password, gen_salt('bf', 10)),
    'admin'
  )
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
