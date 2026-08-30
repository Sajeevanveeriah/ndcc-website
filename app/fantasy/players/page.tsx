import type { Metadata } from 'next';
import Card, { CardContent } from '@/components/ui/Card';
import { getActivePlayersWithLatestPrices, type FantasyPlayerWithPrice } from '@/lib/fantasy-game';
import { getPublishedFantasyLeaderboard } from '@/lib/fantasy-leaderboard';
import { isServerSupabaseConfigured } from '@/lib/supabase-server';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
import DataLoadErrorCard from '@/components/common/DataLoadErrorCard';
import PlayerListExplorer, { type PlayerListEntry } from '@/app/fantasy/_components/PlayerListExplorer';
import SeasonSelector from '@/components/fantasy/SeasonSelector';
import { getSeasonPageContext, seasonStatusLabel, type FantasySeason } from '@/lib/fantasy-seasons';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dino Coach Player Catalogue',
  description: 'Search NDCC players and published Dino Dollar prices.',
};


async function getPlayers(season: FantasySeason | null): Promise<{ players: PlayerListEntry[]; hasPublishedPoints: boolean; loadFailed: boolean }> {
  if (!isServerSupabaseConfigured() || !season) return { players: [], hasPublishedPoints: false, loadFailed: false };

  try {
    const roster: FantasyPlayerWithPrice[] = await getActivePlayersWithLatestPrices(season.id);
    // Published leaderboard totals give the list its points/form sorting; a
    // failure here degrades to the plain roster rather than failing the page.
    let pointsByPlayer = new Map<string, { total: number; matches: number }>();
    try {
      const leaderboard = await getPublishedFantasyLeaderboard(null, season.id);
      pointsByPlayer = new Map(leaderboard.rows.map((row) => [row.playerId, { total: row.totalFantasyPoints, matches: row.matchesCounted }]));
    } catch (err) {
      console.error('[fantasy/players] Failed to load published points; listing roster without points:', err);
    }
    return {
      players: roster.map((player) => ({
        ...player,
        total_points: pointsByPlayer.get(player.id)?.total ?? 0,
        matches_counted: pointsByPlayer.get(player.id)?.matches ?? 0,
      })),
      hasPublishedPoints: pointsByPlayer.size > 0,
      loadFailed: false,
    };
  } catch (err) {
    console.error('[fantasy/players] Failed to load active players with latest prices; showing failure state:', err);
    return { players: [], hasPublishedPoints: false, loadFailed: true };
  }
}

export default async function FantasyPlayersPage({ searchParams: searchParamsPromise }: { searchParams?: Promise<{ season?: string }> }) {
  const searchParams = await searchParamsPromise;
  const seasonContext = await getSeasonPageContext(searchParams?.season || null).catch(() => ({ seasons: [], selected: null, options: [] }));
  const { players, hasPublishedPoints, loadFailed } = await getPlayers(seasonContext.selected);

  return (
    <section className="section-padding">
      <div className="container-width">
        <FantasyBackLink />
        <div className="mb-8 max-w-3xl">
          <h1 className="section-title">Dino Coach player catalogue</h1>
          <p className="font-body text-content-secondary leading-relaxed">
            Search every current selectable NDCC player and compare published Dino Dollar prices. A player&apos;s real-world role never limits their fantasy slot.
          </p>
        </div>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <SeasonSelector seasons={seasonContext.options} selectedSlug={seasonContext.selected?.slug || ''} />
          {seasonContext.selected && (
            <span className="rounded-full bg-maroon-50 dark:bg-maroon-950 px-3 py-1 text-xs font-body text-maroon-700 dark:text-maroon-200">{seasonStatusLabel(seasonContext.selected)} season</span>
          )}
        </div>

        {loadFailed ? (
          <DataLoadErrorCard
            title="We couldn&rsquo;t load the player list"
            retryHref="/fantasy/players"
            backHref="/fantasy"
            backLabel="Back to Dino Coach"
          />
        ) : players.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <h2 className="text-xl font-display font-bold text-content-primary mb-2">No Dino Coach players published yet</h2>
              <p className="font-body text-content-secondary">
                The player list appears after club admins publish active fantasy players and prices.
              </p>
            </CardContent>
          </Card>
        ) : (
          <PlayerListExplorer players={players} hasPublishedPoints={hasPublishedPoints} />
        )}
      </div>
    </section>
  );
}
