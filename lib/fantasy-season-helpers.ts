// Client-safe Dino Coach season types and pure helpers. No server-only or
// Supabase imports, so client components (e.g. the admin seasons page) can use
// these without pulling the service-role client into the browser bundle. The
// data-loading functions live in lib/fantasy-seasons.ts (server only), which
// re-exports everything here for existing server imports.

export type FantasySeasonStatus = 'draft' | 'upcoming' | 'active' | 'completed' | 'archived';

export type FantasySeason = {
  id: string;
  name: string;
  slug: string;
  playhq_season_id: string | null;
  start_date: string | null;
  end_date: string | null;
  status: FantasySeasonStatus;
  is_current: boolean;
  is_public: boolean;
  auto_sync_enabled?: boolean;
  allow_team_building: boolean;
  registration_open: boolean;
  team_selection_open: boolean;
  last_playhq_sync_at: string | null;
};

export const SEASON_COLUMNS =
  'id, name, slug, playhq_season_id, start_date, end_date, status, is_current, is_public, allow_team_building, registration_open, team_selection_open, last_playhq_sync_at';

export function seasonStatusLabel(season: Pick<FantasySeason, 'status'>): string {
  switch (season.status) {
    case 'completed': return 'Historical';
    case 'active': return 'Active';
    case 'upcoming': return 'Upcoming';
    case 'archived': return 'Archived';
    default: return 'Draft';
  }
}

// Historical seasons remain queryable by committee/server workflows as price
// evidence, but they are not alternative live competitions. Public Dino Coach
// surfaces expose only the explicitly current season.
export function operationalSeasons<T extends { is_current: boolean }>(seasons: T[]): T[] {
  return seasons.filter((season) => season.is_current);
}

export function categoriseAdminSeasons<T extends { is_current: boolean }>(seasons: T[]): { operational: T[]; referenceOnly: T[] } {
  return {
    operational: operationalSeasons(seasons),
    referenceOnly: seasons.filter((season) => !season.is_current),
  };
}

// Whether managers may change squads/transfers/chips in this season: the
// current season uses its selection window; other seasons require the
// explicit historical team-building flag.
export function seasonAllowsTeamChanges(season: Pick<FantasySeason, 'is_current' | 'team_selection_open' | 'allow_team_building'>): boolean {
  return season.is_current ? season.team_selection_open : season.allow_team_building;
}

export type SeasonPageContext = {
  seasons: FantasySeason[];
  selected: FantasySeason | null;
  options: Array<{ id: string; slug: string; name: string; statusLabel: string; isCurrent: boolean }>;
};

// Pure selection rule shared with tests: same fallback order as resolveSeason.
export function pickSeason<T extends { slug: string; id: string; is_current: boolean }>(seasons: T[], selector: string | null | undefined): T | null {
  const wanted = (selector || '').trim();
  if (wanted) {
    const match = seasons.find((season) => season.slug === wanted || season.id === wanted);
    if (match) return match;
  }
  return seasons.find((season) => season.is_current) ?? seasons[0] ?? null;
}
