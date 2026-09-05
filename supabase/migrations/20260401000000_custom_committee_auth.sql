-- Custom DB-backed auth for committee/admin portal
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS committee_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'president', 'secretary', 'committee')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS committee_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES committee_users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_committee_users_email ON committee_users (email);
CREATE INDEX IF NOT EXISTS idx_committee_sessions_user_id ON committee_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_committee_sessions_expires_at ON committee_sessions (expires_at);

CREATE OR REPLACE FUNCTION ndcc_verify_committee_user(p_email TEXT, p_password TEXT)
RETURNS TABLE (id UUID, email TEXT, full_name TEXT, role TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT u.id, u.email, u.full_name, u.role
  FROM committee_users u
  WHERE lower(u.email) = lower(p_email)
    AND u.is_active = TRUE
    AND u.password_hash = crypt(p_password, u.password_hash)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION ndcc_set_committee_password(p_user_id UUID, p_password TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  UPDATE committee_users
  SET password_hash = crypt(p_password, gen_salt('bf', 10)),
      updated_at = NOW()
  WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION ndcc_admin_create_committee_user(
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
  SELECT role INTO creator_role FROM committee_users WHERE id = p_created_by AND is_active = TRUE;

  IF creator_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can create committee users';
  END IF;

  INSERT INTO committee_users(email, full_name, password_hash, role)
  VALUES (
    lower(trim(p_email)),
    trim(p_full_name),
    crypt(p_password, gen_salt('bf', 10)),
    p_role
  )
  RETURNING id INTO new_user_id;

  RETURN new_user_id;
END;
$$;

ALTER TABLE committee_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE committee_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct public access to committee_users" ON committee_users;
CREATE POLICY "No direct public access to committee_users" ON committee_users
  FOR ALL USING (FALSE) WITH CHECK (FALSE);

DROP POLICY IF EXISTS "No direct public access to committee_sessions" ON committee_sessions;
CREATE POLICY "No direct public access to committee_sessions" ON committee_sessions
  FOR ALL USING (FALSE) WITH CHECK (FALSE);

CREATE OR REPLACE FUNCTION ndcc_bootstrap_first_admin(
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
  FROM committee_users
  WHERE role = 'admin' AND is_active = TRUE;

  IF existing_admins > 0 THEN
    RAISE EXCEPTION 'Bootstrap disabled: an active admin already exists';
  END IF;

  INSERT INTO committee_users(email, full_name, password_hash, role)
  VALUES (
    lower(trim(p_email)),
    trim(p_full_name),
    crypt(p_password, gen_salt('bf', 10)),
    'admin'
  )
  RETURNING id INTO new_user_id;

  RETURN new_user_id;
END;
$$;
