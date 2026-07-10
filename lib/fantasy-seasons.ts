/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient } from '@/lib/supabase-server';

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

export async function getFantasySeasons(options: { includeNonPublic?: boolean } = {}): Promise<FantasySeason[]> {
  const supabase = createServerClient();
  let query = supabase.from('fantasy_seasons').select(SEASON_COLUMNS).order('start_date', { ascending: false, nullsFirst: false });
  if (!options.includeNonPublic) query = query.eq('is_public', true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as FantasySeason[];
}

export async function getCurrentSeason(): Promise<FantasySeason | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from('fantasy_seasons').select(SEASON_COLUMNS).eq('is_current', true).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FantasySeason | null) ?? null;
}

export async function getSeasonById(seasonId: string): Promise<FantasySeason | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from('fantasy_seasons').select(SEASON_COLUMNS).eq('id', seasonId).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FantasySeason | null) ?? null;
}

// Resolve the season a public page/API should show. `selector` is a slug or id
// from the ?season= query param; missing/unknown selectors fall back to the
// current season, then the most recent public season. Non-public seasons only
// resolve when includeNonPublic is set (admin surfaces).
export async function resolveSeason(selector: string | null | undefined, options: { includeNonPublic?: boolean } = {}): Promise<FantasySeason | null> {
  const seasons = await getFantasySeasons({ includeNonPublic: options.includeNonPublic });
  const wanted = (selector || '').trim();
  if (wanted) {
    const match = seasons.find((season) => season.slug === wanted || season.id === wanted);
    if (match) return match;
  }
  return seasons.find((season) => season.is_current) ?? seasons[0] ?? null;
}

// Resolve the season a public fantasy API call targets: ?season= (or body
// season) slug/id, defaulting to the current public season.
export async function resolveRequestSeason(request: Request, body?: { season?: unknown }): Promise<FantasySeason | null> {
  const url = new URL(request.url);
  const selector = (typeof body?.season === 'string' && body.season) || url.searchParams.get('season');
  return resolveSeason(selector);
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

// One-call context for public fantasy pages: public seasons, the resolved
// selection from ?season=, and dropdown options.
export async function getSeasonPageContext(selector?: string | null): Promise<SeasonPageContext> {
  const seasons = await getFantasySeasons();
  const selected = pickSeason(seasons, selector);
  return {
    seasons,
    selected,
    options: seasons.map((season) => ({ id: season.id, slug: season.slug, name: season.name, statusLabel: seasonStatusLabel(season), isCurrent: season.is_current })),
  };
}

// Pure selection rule shared with tests: same fallback order as resolveSeason.
export function pickSeason<T extends { slug: string; id: string; is_current: boolean }>(seasons: T[], selector: string | null | undefined): T | null {
  const wanted = (selector || '').trim();
  if (wanted) {
    const match = seasons.find((season) => season.slug === wanted || season.id === wanted);
    if (match) return match;
  }
  return seasons.find((season) => season.is_current) ?? seasons[0] ?? null;
}
