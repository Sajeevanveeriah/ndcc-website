import type { Metadata } from 'next';
import Badge from '@/components/ui/Badge';
import Card, { CardContent } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { getActivePlayersWithLatestPrices, type FantasyPlayerWithPrice } from '@/lib/fantasy-game';
import { isServerSupabaseConfigured } from '@/lib/supabase-server';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
import DataLoadErrorCard from '@/components/common/DataLoadErrorCard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fantasy Player List',
  description: 'View available NDCC Fantasy Cricket players, roles, teams, and prices.',
};


async function getPlayers() {
  if (!isServerSupabaseConfigured()) return { players: [] as FantasyPlayerWithPrice[], loadFailed: false };

  try {
    return { players: await getActivePlayersWithLatestPrices(), loadFailed: false };
  } catch (err) {
    console.error('[fantasy/players] Failed to load active players with latest prices; showing failure state:', err);
    return { players: [] as FantasyPlayerWithPrice[], loadFailed: true };
  }
}

export default async function FantasyPlayersPage() {
  const { players, loadFailed } = await getPlayers();

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
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Player</TableHeader>
                <TableHeader>Role</TableHeader>
                <TableHeader>Team / grade</TableHeader>
                <TableHeader>Price</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {players.map((player) => (
                <TableRow key={player.id}>
                  <TableCell className="font-medium">{player.display_name}</TableCell>
                  <TableCell><Badge>{player.role}</Badge></TableCell>
                  <TableCell>{player.team_label || 'NDCC'}</TableCell>
                  <TableCell>{player.price_million.toFixed(1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}
