import type { Metadata } from 'next';
import Card, { CardContent } from '@/components/ui/Card';
import { getActivePlayersWithLatestPrices, type FantasyPlayerWithPrice } from '@/lib/fantasy-game';
import { getPublishedFantasyLeaderboard } from '@/lib/fantasy-leaderboard';
import { isServerSupabaseConfigured } from '@/lib/supabase-server';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
import DataLoadErrorCard from '@/components/common/DataLoadErrorCard';
import PlayerListExplorer, { type PlayerListEntry } from '@/app/fantasy/_components/PlayerListExplorer';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fantasy Player List',
  description: 'View available NDCC Fantasy Cricket players, roles, teams, and prices.',
};


async function getPlayers(): Promise<{ players: PlayerListEntry[]; hasPublishedPoints: boolean; loadFailed: boolean }> {
  if (!isServerSupabaseConfigured()) return { players: [], hasPublishedPoints: false, loadFailed: false };

  try {
    const roster: FantasyPlayerWithPrice[] = await getActivePlayersWithLatestPrices();
    // Published leaderboard totals give the list its points/form sorting; a
    // failure here degrades to the plain roster rather than failing the page.
    let pointsByPlayer = new Map<string, { total: number; matches: number }>();
    try {
      const leaderboard = await getPublishedFantasyLeaderboard();
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

export default async function FantasyPlayersPage() {
  const { players, hasPublishedPoints, loadFailed } = await getPlayers();

  return (
    <section className="section-padding">
      <div className="container-width">
        <FantasyBackLink />
        <div className="mb-8 max-w-3xl">
          <h1 className="section-title">Fantasy Player List</h1>
          <p className="font-body text-gray-700 leading-relaxed">
            Browse active fantasy players published by the club, including role, team or grade label, and current fantasy price.
          </p>
        </div>

        {loadFailed ? (
          <DataLoadErrorCard
            title="We couldn&rsquo;t load the player list"
            retryHref="/fantasy/players"
            backHref="/fantasy"
            backLabel="Back to Fantasy Cricket"
          />
        ) : players.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <h2 className="text-xl font-display font-bold text-gray-900 mb-2">No active fantasy players published yet</h2>
              <p className="font-body text-gray-700">
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
