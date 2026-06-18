import type { Metadata } from 'next';
import Link from 'next/link';
import Card, { CardContent } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { CLUB_SHORT } from '@/lib/constants';
import { getPublishedFantasyLeaderboard } from '@/lib/fantasy-leaderboard';
import { ArrowLeft, Trophy } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Fantasy Cricket Leaderboard',
  description: 'Published-only NDCC Fantasy Cricket player leaderboard.',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PageProps = {
  searchParams?: {
    round?: string;
  };
};

function roundHref(roundId: string | null) {
  return roundId ? `/fantasy/leaderboard?round=${encodeURIComponent(roundId)}` : '/fantasy/leaderboard';
}

export default async function FantasyLeaderboardPage({ searchParams }: PageProps) {
  let leaderboard;
  try {
    leaderboard = await getPublishedFantasyLeaderboard(searchParams?.round || null);
  } catch {
    leaderboard = { rows: [], rounds: [], selectedRoundId: null };
  }

  const selectedRound = leaderboard.rounds.find((round) => round.id === leaderboard.selectedRoundId);

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <p className="text-sm font-body font-semibold uppercase tracking-[0.25em] text-maroon-100 mb-3">
            {CLUB_SHORT} Fantasy Cricket
          </p>
          <h1 className="page-hero-title">Player Leaderboard</h1>
          <p className="page-hero-subtitle">
            Published fantasy import batches only. Draft, reviewed, and rejected imports are never shown here.
          </p>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          <div className="mb-8">
            <Link href="/fantasy" className="inline-flex items-center text-maroon-700 hover:underline font-body font-semibold">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back to Fantasy Cricket
            </Link>
          </div>

          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
                    <Trophy className="h-6 w-6 text-maroon-700" aria-hidden="true" />
                    {selectedRound ? `Round ${selectedRound.roundNumber}: ${selectedRound.name}` : 'All rounds'}
                  </h2>
                  <p className="text-gray-600 font-body mt-1">Totals are recalculated from the current Fantasy Cricket scoring rules.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={roundHref(null)} className={`px-4 py-2 rounded-md font-body font-semibold text-sm ${!leaderboard.selectedRoundId ? 'bg-maroon-700 text-white' : 'border border-maroon-700 text-maroon-700 hover:bg-maroon-50'}`}>
                    All rounds
                  </Link>
                  {leaderboard.rounds.map((round) => (
                    <Link key={round.id} href={roundHref(round.id)} className={`px-4 py-2 rounded-md font-body font-semibold text-sm ${leaderboard.selectedRoundId === round.id ? 'bg-maroon-700 text-white' : 'border border-maroon-700 text-maroon-700 hover:bg-maroon-50'}`}>
                      Round {round.roundNumber}
                    </Link>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {leaderboard.rows.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <h2 className="text-xl font-display font-bold text-gray-900 mb-2">No published scores yet</h2>
                <p className="text-gray-700 font-body">The leaderboard will appear after NDCC publishes an approved fantasy import batch.</p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Rank</TableHeader>
                  <TableHeader>Player</TableHeader>
                  <TableHeader>Role</TableHeader>
                  <TableHeader>Matches</TableHeader>
                  <TableHeader>Runs</TableHeader>
                  <TableHeader>Wickets</TableHeader>
                  <TableHeader>Maidens</TableHeader>
                  <TableHeader>Catches</TableHeader>
                  <TableHeader>Runouts</TableHeader>
                  <TableHeader>Stumpings</TableHeader>
                  <TableHeader>Ducks</TableHeader>
                  <TableHeader>Total points</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {leaderboard.rows.map((row) => (
                  <TableRow key={row.playerId}>
                    <TableCell className="font-bold">{row.rank}</TableCell>
                    <TableCell className="font-medium">{row.playerName}</TableCell>
                    <TableCell>{row.role || '—'}</TableCell>
                    <TableCell>{row.matchesCounted}</TableCell>
                    <TableCell>{row.runs}</TableCell>
                    <TableCell>{row.wickets}</TableCell>
                    <TableCell>{row.maidens}</TableCell>
                    <TableCell>{row.catches}</TableCell>
                    <TableCell>{row.runouts}</TableCell>
                    <TableCell>{row.stumpings}</TableCell>
                    <TableCell>{row.ducks}</TableCell>
                    <TableCell className="font-bold text-maroon-800">{row.totalFantasyPoints}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </>
  );
}
