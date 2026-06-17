CREATE OR REPLACE FUNCTION ndcc_admin_reset_committee_user(
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_password TEXT
)
RETURNS TABLE (id UUID, email TEXT, full_name TEXT, role TEXT, is_active BOOLEAN, sessions_revoked INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id UUID;
  revoked_count INTEGER := 0;
BEGIN
  IF p_role NOT IN ('admin', 'president', 'secretary', 'committee') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  INSERT INTO committee_users(email, full_name, password_hash, role, is_active)
  VALUES (lower(trim(p_email)), trim(p_full_name), crypt(p_password, gen_salt('bf', 10)), p_role, TRUE)
  ON CONFLICT (email) DO UPDATE
  SET full_name = COALESCE(NULLIF(committee_users.full_name, ''), EXCLUDED.full_name),
      password_hash = crypt(p_password, gen_salt('bf', 10)),
      role = EXCLUDED.role,
      is_active = TRUE,
      updated_at = NOW()
  RETURNING committee_users.id INTO target_user_id;

  DELETE FROM committee_sessions WHERE user_id = target_user_id;
  GET DIAGNOSTICS revoked_count = ROW_COUNT;

  RETURN QUERY
  SELECT u.id, u.email, u.full_name, u.role, u.is_active, revoked_count
  FROM committee_users u
  WHERE u.id = target_user_id;
END;
$$;
