-- Granular CMS access for restricted Committee and Fantasy Support users.
-- This migration is forward-only and remains compatible with the currently
-- deployed application. Existing five-argument auth RPCs are left intact;
-- new access-aware RPCs are added for the new application code.

ALTER TABLE public.committee_users
  ADD COLUMN IF NOT EXISTS cms_permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE public.committee_users DROP CONSTRAINT IF EXISTS committee_users_role_check;
ALTER TABLE public.committee_users ADD CONSTRAINT committee_users_role_check CHECK (role IN (
  'admin',
  'president',
  'secretary',
  'vice_president',
  'treasurer',
  'committee',
  'fantasy_manager',
  'fantasy_support'
));

-- Preserve the effective module visibility existing Committee users had before
-- granular access was introduced. Users can be reduced explicitly after rollout.
UPDATE public.committee_users
SET cms_permissions = ARRAY[
  'dashboard',
  'season.setup',
  'season.registration',
  'club.details',
  'teams',
  'appointments',
  'calendar',
  'news',
  'publications',
  'events',
  'pages',
  'content',
  'gallery',
  'history',
  'minutes',
  'volunteers',
  'memberships',
  'enquiries',
  'sponsors',
  'merchandise',
  'kitchen',
  'orders',
  'payments',
  'fantasy.home',
  'fantasy.seasons',
  'fantasy.players',
  'fantasy.imports',
  'fantasy.review',
  'fantasy.diagnostics',
  'diagnostics.email',
  'diagnostics.media'
]::TEXT[]
WHERE role = 'committee'
  AND cardinality(cms_permissions) = 0;

CREATE OR REPLACE FUNCTION public.ndcc_cms_permissions_are_unique(p_permissions TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(cardinality(p_permissions), 0) = (
    SELECT count(DISTINCT permission)
    FROM unnest(COALESCE(p_permissions, ARRAY[]::TEXT[])) AS p(permission)
  );
$$;

REVOKE ALL ON FUNCTION public.ndcc_cms_permissions_are_unique(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ndcc_cms_permissions_are_unique(TEXT[]) TO service_role;

ALTER TABLE public.committee_users DROP CONSTRAINT IF EXISTS committee_users_cms_permissions_check;
ALTER TABLE public.committee_users ADD CONSTRAINT committee_users_cms_permissions_check CHECK (
  public.ndcc_cms_permissions_are_unique(cms_permissions)
  AND cms_permissions <@ ARRAY[
    'dashboard',
    'season.setup',
    'season.registration',
    'club.details',
    'teams',
    'appointments',
    'calendar',
    'news',
    'publications',
    'events',
    'pages',
    'content',
    'gallery',
    'history',
    'minutes',
    'volunteers',
    'memberships',
    'enquiries',
    'sponsors',
    'merchandise',
    'kitchen',
    'orders',
    'payments',
    'fantasy.home',
    'fantasy.seasons',
    'fantasy.players',
    'fantasy.imports',
    'fantasy.review',
    'fantasy.diagnostics',
    'diagnostics.email',
    'diagnostics.media'
  ]::TEXT[]
  AND (
    role <> 'fantasy_support'
    OR cms_permissions <@ ARRAY[
      'fantasy.home',
      'fantasy.seasons',
      'fantasy.players',
      'fantasy.imports',
      'fantasy.review',
      'fantasy.diagnostics'
    ]::TEXT[]
  )
  AND (
    role IN ('committee', 'fantasy_support')
    OR cardinality(cms_permissions) = 0
  )
);

CREATE OR REPLACE FUNCTION public.ndcc_admin_create_committee_user_with_access(
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_password TEXT,
  p_permissions TEXT[],
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
  normalized_permissions TEXT[] := COALESCE(p_permissions, ARRAY[]::TEXT[]);
  supplied_count INTEGER;
  distinct_count INTEGER;
BEGIN
  SELECT u.role INTO creator_role
  FROM public.committee_users u
  WHERE u.id = p_created_by AND u.is_active = TRUE;

  IF creator_role NOT IN ('admin', 'president', 'secretary', 'vice_president', 'treasurer') THEN
    RAISE EXCEPTION 'Only executive CMS users can create CMS users';
  END IF;

  IF p_role NOT IN ('admin', 'president', 'secretary', 'vice_president', 'treasurer', 'committee', 'fantasy_manager', 'fantasy_support') THEN
    RAISE EXCEPTION 'Invalid CMS role';
  END IF;

  SELECT count(*), count(DISTINCT permission)
  INTO supplied_count, distinct_count
  FROM unnest(normalized_permissions) AS p(permission);

  IF supplied_count <> distinct_count THEN
    RAISE EXCEPTION 'Duplicate CMS permissions are not allowed';
  END IF;

  IF NOT normalized_permissions <@ ARRAY[
    'dashboard', 'season.setup', 'season.registration', 'club.details', 'teams', 'appointments', 'calendar',
    'news', 'publications', 'events', 'pages', 'content', 'gallery', 'history', 'minutes', 'volunteers',
    'memberships', 'enquiries', 'sponsors', 'merchandise', 'kitchen', 'orders', 'payments', 'fantasy.home',
    'fantasy.seasons', 'fantasy.players', 'fantasy.imports', 'fantasy.review', 'fantasy.diagnostics',
    'diagnostics.email', 'diagnostics.media'
  ]::TEXT[] THEN
    RAISE EXCEPTION 'Invalid CMS permission';
  END IF;

  IF p_role = 'fantasy_support' AND NOT normalized_permissions <@ ARRAY[
    'fantasy.home', 'fantasy.seasons', 'fantasy.players', 'fantasy.imports', 'fantasy.review', 'fantasy.diagnostics'
  ]::TEXT[] THEN
    RAISE EXCEPTION 'Fantasy Support can only receive Fantasy permissions';
  END IF;

  IF p_role NOT IN ('committee', 'fantasy_support') AND cardinality(normalized_permissions) <> 0 THEN
    RAISE EXCEPTION 'This role derives access from role and cannot store granular permissions';
  END IF;

  INSERT INTO public.committee_users(email, full_name, password_hash, role, cms_permissions)
  VALUES (
    lower(trim(p_email)),
    trim(p_full_name),
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    p_role,
    normalized_permissions
  )
  RETURNING id INTO new_user_id;

  RETURN new_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ndcc_admin_update_committee_user_access(
  p_user_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_is_active BOOLEAN,
  p_permissions TEXT[],
  p_updated_by UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  updater_role TEXT;
  normalized_permissions TEXT[] := COALESCE(p_permissions, ARRAY[]::TEXT[]);
  supplied_count INTEGER;
  distinct_count INTEGER;
BEGIN
  SELECT u.role INTO updater_role
  FROM public.committee_users u
  WHERE u.id = p_updated_by AND u.is_active = TRUE;

  IF updater_role NOT IN ('admin', 'president', 'secretary', 'vice_president', 'treasurer') THEN
    RAISE EXCEPTION 'Only executive CMS users can update CMS users';
  END IF;

  IF p_role NOT IN ('admin', 'president', 'secretary', 'vice_president', 'treasurer', 'committee', 'fantasy_manager', 'fantasy_support') THEN
    RAISE EXCEPTION 'Invalid CMS role';
  END IF;

  SELECT count(*), count(DISTINCT permission)
  INTO supplied_count, distinct_count
  FROM unnest(normalized_permissions) AS p(permission);

  IF supplied_count <> distinct_count THEN
    RAISE EXCEPTION 'Duplicate CMS permissions are not allowed';
  END IF;

  IF NOT normalized_permissions <@ ARRAY[
    'dashboard', 'season.setup', 'season.registration', 'club.details', 'teams', 'appointments', 'calendar',
    'news', 'publications', 'events', 'pages', 'content', 'gallery', 'history', 'minutes', 'volunteers',
    'memberships', 'enquiries', 'sponsors', 'merchandise', 'kitchen', 'orders', 'payments', 'fantasy.home',
    'fantasy.seasons', 'fantasy.players', 'fantasy.imports', 'fantasy.review', 'fantasy.diagnostics',
    'diagnostics.email', 'diagnostics.media'
  ]::TEXT[] THEN
    RAISE EXCEPTION 'Invalid CMS permission';
  END IF;

  IF p_role = 'fantasy_support' AND NOT normalized_permissions <@ ARRAY[
    'fantasy.home', 'fantasy.seasons', 'fantasy.players', 'fantasy.imports', 'fantasy.review', 'fantasy.diagnostics'
  ]::TEXT[] THEN
    RAISE EXCEPTION 'Fantasy Support can only receive Fantasy permissions';
  END IF;

  IF p_role NOT IN ('committee', 'fantasy_support') AND cardinality(normalized_permissions) <> 0 THEN
    RAISE EXCEPTION 'This role derives access from role and cannot store granular permissions';
  END IF;

  UPDATE public.committee_users
  SET email = lower(trim(p_email)),
      full_name = trim(p_full_name),
      role = p_role,
      is_active = p_is_active,
      cms_permissions = normalized_permissions,
      updated_at = NOW()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CMS user not found';
  END IF;

  DELETE FROM public.committee_sessions WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ndcc_admin_create_committee_user_with_access(TEXT, TEXT, TEXT, TEXT, TEXT[], UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ndcc_admin_update_committee_user_access(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT[], UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ndcc_admin_create_committee_user_with_access(TEXT, TEXT, TEXT, TEXT, TEXT[], UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.ndcc_admin_update_committee_user_access(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT[], UUID) TO service_role;

ALTER TABLE public.committee_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_sessions ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
