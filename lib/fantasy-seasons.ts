/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only';
import { createServerClient } from '@/lib/supabase-server';
import {
  operationalSeasons,
  pickSeason,
  SEASON_COLUMNS,
  seasonStatusLabel,
  type FantasySeason,
  type SeasonPageContext,
} from '@/lib/fantasy-season-helpers';

// Server-side season loading. Pure helpers and types live in
// lib/fantasy-season-helpers.ts (client-safe) and are re-exported here so
// existing server imports keep working unchanged.
export * from '@/lib/fantasy-season-helpers';

export async function getFantasySeasons(options: { includeNonPublic?: boolean } = {}): Promise<FantasySeason[]> {
  const supabase = createServerClient();
  let query = supabase.from('fantasy_seasons').select(SEASON_COLUMNS).order('start_date', { ascending: false, nullsFirst: false });
  if (!options.includeNonPublic) query = query.eq('is_public', true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const seasons = (data ?? []) as FantasySeason[];
  return options.includeNonPublic ? seasons : operationalSeasons(seasons);
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
