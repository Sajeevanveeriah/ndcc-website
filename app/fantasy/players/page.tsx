import type { Metadata } from 'next';
import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import Card, { CardContent } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { getActivePlayersWithLatestPrices, type FantasyPlayerWithPrice } from '@/lib/fantasy-game';
import { isServerSupabaseConfigured } from '@/lib/supabase-server';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fantasy Player List',
  description: 'View available NDCC Fantasy Cricket players, roles, teams, and prices.',
};


async function getPlayers() {
  if (!isServerSupabaseConfigured()) return { players: [] as FantasyPlayerWithPrice[], error: null };

  try {
    return { players: await getActivePlayersWithLatestPrices(), error: null };
  } catch {
    return { players: [] as FantasyPlayerWithPrice[], error: 'Player data is being refreshed. Please check back shortly.' };
  }
}

export default async function FantasyPlayersPage() {
  const { players, error } = await getPlayers();

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

        {error ? (
          <Card>
            <CardContent className="p-8">
              <h2 className="text-xl font-display font-bold text-gray-900 mb-2">Player list is being refreshed</h2>
              <p className="font-body text-gray-700 mb-4">{error}</p>
              <Link href="/fantasy" className="btn-secondary">Back to Fantasy Cricket</Link>
            </CardContent>
          </Card>
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
