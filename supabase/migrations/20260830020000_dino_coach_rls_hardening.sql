-- Route all Dino Coach mutations through the authenticated server APIs.
-- Those routes verify the bearer token, resolve the manager server-side and
-- use the service role only after applying the current game rules. The legacy
-- authenticated policies below otherwise let a browser bypass that boundary.

BEGIN;

DROP POLICY IF EXISTS fantasy_managers_owner_insert ON public.fantasy_managers;
DROP POLICY IF EXISTS fantasy_managers_owner_update ON public.fantasy_managers;
DROP POLICY IF EXISTS fantasy_squads_owner_all ON public.fantasy_squads;
DROP POLICY IF EXISTS fantasy_squad_players_owner_all ON public.fantasy_squad_players;
DROP POLICY IF EXISTS fantasy_transfers_owner_insert ON public.fantasy_transfers;
DROP POLICY IF EXISTS fantasy_chips_owner_all ON public.fantasy_chips;
DROP POLICY IF EXISTS fantasy_leagues_owner_insert ON public.fantasy_leagues;
DROP POLICY IF EXISTS fantasy_league_members_owner_insert ON public.fantasy_league_members;

-- The three FOR ALL policies also supplied owner reads. Restore only that
-- required read behaviour; existing manager, transfer and league SELECT
-- policies remain unchanged.
DROP POLICY IF EXISTS fantasy_squads_owner_read ON public.fantasy_squads;
CREATE POLICY fantasy_squads_owner_read ON public.fantasy_squads
FOR SELECT TO authenticated
USING (
  manager_id IN (
    SELECT id FROM public.fantasy_managers WHERE auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS fantasy_squad_players_owner_read ON public.fantasy_squad_players;
CREATE POLICY fantasy_squad_players_owner_read ON public.fantasy_squad_players
FOR SELECT TO authenticated
USING (
  squad_id IN (
    SELECT s.id
    FROM public.fantasy_squads AS s
    JOIN public.fantasy_managers AS m ON m.id = s.manager_id
    WHERE m.auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS fantasy_chips_owner_read ON public.fantasy_chips;
CREATE POLICY fantasy_chips_owner_read ON public.fantasy_chips
FOR SELECT TO authenticated
USING (
  manager_id IN (
    SELECT id FROM public.fantasy_managers WHERE auth_user_id = auth.uid()
  )
);

-- Table privileges are a second boundary around RLS. Revoke every privilege,
-- including TRUNCATE (which RLS does not protect), then restore SELECT only.
-- PUBLIC is included so a future broad grant cannot silently restore browser-
-- role writes. service_role is deliberately unchanged for the server routes.
REVOKE ALL PRIVILEGES ON TABLE
  public.fantasy_settings,
  public.fantasy_managers,
  public.fantasy_squads,
  public.fantasy_squad_players,
  public.fantasy_transfers,
  public.fantasy_chips,
  public.fantasy_leagues,
  public.fantasy_league_members,
  public.fantasy_manager_round_scores
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.fantasy_settings,
  public.fantasy_managers,
  public.fantasy_squads,
  public.fantasy_squad_players,
  public.fantasy_transfers,
  public.fantasy_chips,
  public.fantasy_leagues,
  public.fantasy_league_members,
  public.fantasy_manager_round_scores
TO authenticated;

COMMIT;

-- Rollback: recreate the eight legacy policies from
-- 20260517143000_fantasy_playable_mvp.sql and re-grant table writes only if
-- the server-side trust boundary is intentionally retired at the same time.
