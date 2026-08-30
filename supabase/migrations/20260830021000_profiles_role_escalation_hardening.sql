-- Retire browser-side CMS authorisation through public.profiles.
--
-- A self-service authenticated account could previously insert or update its
-- own profile row with an arbitrary role. Policies on CMS and operational
-- tables then trusted that role, turning a normal account into an administrator.
-- All privileged CMS access is server-side, where committee membership and
-- permissions are checked before the service role is used.

BEGIN;

-- Remove self-service profile mutation. Retain only an authenticated user's
-- ability to read their own profile for compatibility with existing clients.
DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
DROP POLICY IF EXISTS profiles_update ON public.profiles;
DROP POLICY IF EXISTS profiles_delete ON public.profiles;

CREATE POLICY profiles_select ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid());

-- Drop every live policy that derives CMS authority from profiles.role.
-- The quoted names are retained in a fresh replay from the original May CMS
-- migrations even though later production recovery work replaced them with
-- canonical snake_case names. Drop both lineages so preview databases and
-- production converge on the same least-privilege end state.
DROP POLICY IF EXISTS "Public can read club settings" ON public.club_settings;
DROP POLICY IF EXISTS "Admins have full access to club settings" ON public.club_settings;
DROP POLICY IF EXISTS "Committee can read club settings" ON public.club_settings;
DROP POLICY IF EXISTS club_settings_delete ON public.club_settings;
DROP POLICY IF EXISTS club_settings_insert ON public.club_settings;
DROP POLICY IF EXISTS club_settings_select ON public.club_settings;
DROP POLICY IF EXISTS club_settings_update ON public.club_settings;

DROP POLICY IF EXISTS contacts_delete ON public.contacts;
DROP POLICY IF EXISTS contacts_select ON public.contacts;
DROP POLICY IF EXISTS contacts_update ON public.contacts;

DROP POLICY IF EXISTS event_registrations_delete ON public.event_registrations;
DROP POLICY IF EXISTS event_registrations_select ON public.event_registrations;
DROP POLICY IF EXISTS event_registrations_update ON public.event_registrations;

DROP POLICY IF EXISTS events_delete ON public.events;
DROP POLICY IF EXISTS events_insert ON public.events;
DROP POLICY IF EXISTS events_select ON public.events;
DROP POLICY IF EXISTS events_update ON public.events;

DROP POLICY IF EXISTS news_delete ON public.news;
DROP POLICY IF EXISTS news_insert ON public.news;
DROP POLICY IF EXISTS news_select ON public.news;
DROP POLICY IF EXISTS news_update ON public.news;

DROP POLICY IF EXISTS orders_delete ON public.orders;
DROP POLICY IF EXISTS orders_select ON public.orders;
DROP POLICY IF EXISTS orders_update ON public.orders;

DROP POLICY IF EXISTS sponsors_delete ON public.sponsors;
DROP POLICY IF EXISTS sponsors_insert ON public.sponsors;
DROP POLICY IF EXISTS sponsors_select ON public.sponsors;
DROP POLICY IF EXISTS sponsors_update ON public.sponsors;

DROP POLICY IF EXISTS "Public can read active teams" ON public.teams;
DROP POLICY IF EXISTS "Admins have full access to teams" ON public.teams;
DROP POLICY IF EXISTS "Committee can read teams" ON public.teams;
DROP POLICY IF EXISTS teams_delete ON public.teams;
DROP POLICY IF EXISTS teams_insert ON public.teams;
DROP POLICY IF EXISTS teams_select ON public.teams;
DROP POLICY IF EXISTS teams_update ON public.teams;

DROP POLICY IF EXISTS volunteers_delete ON public.volunteers;
DROP POLICY IF EXISTS volunteers_select ON public.volunteers;
DROP POLICY IF EXISTS volunteers_update ON public.volunteers;

-- Restore only the public content projections used by the website. Draft or
-- inactive content and all operational records remain server-only.
CREATE POLICY club_settings_select ON public.club_settings
FOR SELECT TO anon, authenticated
USING (id = 'default');

CREATE POLICY events_select ON public.events
FOR SELECT TO anon, authenticated
USING (published = true);

CREATE POLICY news_select ON public.news
FOR SELECT TO anon, authenticated
USING (published = true);

CREATE POLICY sponsors_select ON public.sponsors
FOR SELECT TO anon, authenticated
USING (active = true);

CREATE POLICY teams_select ON public.teams
FOR SELECT TO anon, authenticated
USING (is_active = true);

-- Abort the migration if an unexpected legacy policy still derives access
-- from public.profiles. Policy names changed during earlier recovery work, so
-- checking the final expressions closes aliases that the explicit drops above
-- could not anticipate.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'club_settings', 'contacts', 'event_registrations', 'events', 'news',
        'orders', 'sponsors', 'teams', 'volunteers'
      )
      AND (
        coalesce(qual, '') || ' ' || coalesce(with_check, '')
      ) ~* '(^|[^a-z0-9_])(?:public[.])?profiles([^a-z0-9_]|$)'
  ) THEN
    RAISE EXCEPTION 'A protected-table policy still depends on public.profiles.';
  END IF;
END
$$;

-- Privileges form a second boundary around RLS. In particular, TRUNCATE is not
-- subject to RLS. Remove every browser-role privilege first, then grant back
-- only the reads above. service_role is deliberately unchanged.
REVOKE ALL PRIVILEGES ON TABLE
  public.profiles,
  public.club_settings,
  public.contacts,
  public.event_registrations,
  public.events,
  public.news,
  public.orders,
  public.sponsors,
  public.teams,
  public.volunteers
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.profiles TO authenticated;

GRANT SELECT ON TABLE
  public.club_settings,
  public.events,
  public.news,
  public.sponsors,
  public.teams
TO anon, authenticated;

COMMIT;

-- Rollback is intentionally not automated: restoring these policies would
-- reopen the privilege-escalation path. Reintroduce browser writes only with
-- immutable server-assigned claims and an independently reviewed policy model.
