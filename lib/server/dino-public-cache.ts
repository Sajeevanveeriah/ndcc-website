import 'server-only';

import { unstable_cache } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { getActivePlayersWithLatestPrices, getFantasySettings } from '@/lib/fantasy-game';
import { getPublishedFantasyLeaderboard } from '@/lib/fantasy-leaderboard';
import { getDinoCoachSettings } from '@/lib/dino-coach/server';
import { getDinoManagerStandings } from '@/lib/dino-coach/standings';
import { getPlayerStats } from '@/lib/dino-coach/player-stats-server';
import { DINO_PUBLIC_CACHE_SECONDS, DINO_PUBLIC_CACHE_TAG } from '@/lib/dino-coach/public-cache-tag';
import { getFantasySeasons, pickSeason, seasonStatusLabel, type FantasySeason, type SeasonPageContext } from '@/lib/fantasy-seasons';

/**
 * Short-lived shared cache for the PUBLIC Dino Coach reads (season list,
 * settings, player pool and prices, stats, leaderboards, launch switch).
 *
 * Under load every uncached page asked the database the same questions, and
 * requests queued for a database connection until they timed out. These reads
 * are identical for every visitor, so one copy per 60 seconds serves them all.
 *
 * Only public read surfaces use this module. Squad saves, transfers, checkout,
 * rules acceptance and every admin screen keep reading the database directly,
 * and the database functions that save squads price players themselves, so a
 * cached price can never be charged. Admin and cron writers clear the tag via
 * revalidateDinoPublicCache() so changes normally show immediately.
 *
 * Every loader here throws on a database error, and unstable_cache never stores
 * a thrown result, so a failed read is not cached.
 */

export { DINO_PUBLIC_CACHE_SECONDS, DINO_PUBLIC_CACHE_TAG };
const options = { revalidate: DINO_PUBLIC_CACHE_SECONDS, tags: [DINO_PUBLIC_CACHE_TAG] };

export const getCachedPublicSeasons = unstable_cache(
  async (): Promise<FantasySeason[]> => getFantasySeasons(),
  ['dino-public-seasons-v1'],
  options,
);

/** Same selection rules as resolveSeason() for public seasons. */
export async function resolveCachedPublicSeason(selector: string | null | undefined): Promise<FantasySeason | null> {
  const seasons = await getCachedPublicSeasons();
  const wanted = (selector || '').trim();
  if (wanted) {
    const match = seasons.find((season) => season.slug === wanted || season.id === wanted);
    if (match) return match;
  }
  return seasons.find((season) => season.is_current) ?? seasons[0] ?? null;
}

export async function resolveCachedRequestSeason(request: Request): Promise<FantasySeason | null> {
  return resolveCachedPublicSeason(new URL(request.url).searchParams.get('season'));
}

/** Same result as getSeasonPageContext(), from the cached season list. */
export async function getCachedSeasonPageContext(selector?: string | null): Promise<SeasonPageContext> {
  const seasons = await getCachedPublicSeasons();
  const selected = pickSeason(seasons, selector);
  return {
    seasons,
    selected,
    options: seasons.map((season) => ({ id: season.id, slug: season.slug, name: season.name, statusLabel: seasonStatusLabel(season), isCurrent: season.is_current })),
  };
}

export const getCachedFantasySettings = unstable_cache(
  async (seasonId: string | null) => getFantasySettings(seasonId),
  ['dino-public-fantasy-settings-v1'],
  options,
);

export const getCachedDinoCoachSettings = unstable_cache(
  async (seasonId: string) => getDinoCoachSettings(seasonId),
  ['dino-public-dino-settings-v1'],
  options,
);

export const getCachedActivePlayers = unstable_cache(
  async (seasonId: string) => getActivePlayersWithLatestPrices(seasonId),
  ['dino-public-players-v1'],
  options,
);

export const getCachedPublishedLeaderboard = unstable_cache(
  async (roundId: string | null, seasonId: string | null) => getPublishedFantasyLeaderboard(roundId, seasonId),
  ['dino-public-leaderboard-v1'],
  options,
);

export const getCachedManagerStandings = unstable_cache(
  async (seasonId: string | null) => getDinoManagerStandings(seasonId),
  ['dino-public-manager-standings-v1'],
  options,
);

// getPlayerStats returns a Map, which the cache cannot store; keep the entries.
const getCachedPlayerStatsEntries = unstable_cache(
  async (seasonId: string, players: Array<{ id: string; display_name: string }>) => [...(await getPlayerStats(seasonId, players)).entries()],
  ['dino-public-player-stats-v1'],
  options,
);

export async function getCachedPlayerStats(seasonId: string, players: Array<{ id: string; display_name: string }>) {
  const roster = players.map((player) => ({ id: player.id, display_name: player.display_name }));
  return new Map(await getCachedPlayerStatsEntries(seasonId, roster));
}

/**
 * Whether Dino Coach is publicly launched for the current season. Throws on a
 * database error (not cached) so callers can tell "off" from "unavailable".
 */
export const getCachedDinoLaunchState = unstable_cache(
  async (): Promise<{ seasonId: string | null; publicLaunchEnabled: boolean }> => {
    const supabase = createServerClient({ retryReads: true });
    const { data: season, error: seasonError } = await supabase
      .from('fantasy_seasons')
      .select('id')
      .eq('is_current', true)
      .limit(1)
      .maybeSingle();
    if (seasonError) throw new Error(seasonError.message);
    if (!season?.id) return { seasonId: null, publicLaunchEnabled: false };
    const { data: settings, error: settingsError } = await supabase
      .from('fantasy_dino_settings')
      .select('public_launch_enabled')
      .eq('season_id', season.id)
      .maybeSingle();
    if (settingsError) throw new Error(settingsError.message);
    return { seasonId: season.id, publicLaunchEnabled: settings?.public_launch_enabled === true };
  },
  ['dino-public-launch-state-v1'],
  options,
);
