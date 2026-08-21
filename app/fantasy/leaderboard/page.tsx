import type { Metadata } from 'next';
import Link from 'next/link';
import Card, { CardContent } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { CLUB_SHORT } from '@/lib/constants';
import { getPublishedFantasyLeaderboard } from '@/lib/fantasy-leaderboard';
import { Trophy } from 'lucide-react';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
import DataLoadErrorCard from '@/components/common/DataLoadErrorCard';
import SeasonSelector from '@/components/fantasy/SeasonSelector';
import { getSeasonPageContext, seasonStatusLabel } from '@/lib/fantasy-seasons';

export const metadata: Metadata = {
  title: 'Dino Coach Leaderboard',
  description: 'Published-only NDCC Dino Coach player leaderboard.',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PageProps = {
  searchParams?: {
    round?: string;
    season?: string;
  };
};

function roundHref(roundId: string | null, seasonSlug?: string | null) {
  const params = new URLSearchParams();
  if (roundId) params.set('round', roundId);
  if (seasonSlug) params.set('season', seasonSlug);
  const query = params.toString();
  return query ? `/fantasy/leaderboard?${query}` : '/fantasy/leaderboard';
}

export default async function FantasyLeaderboardPage({ searchParams }: PageProps) {
  const seasonContext = await getSeasonPageContext(searchParams?.season || null).catch(() => ({ seasons: [], selected: null, options: [] }));
  let leaderboard;
  let loadFailed = false;
  try {
    leaderboard = await getPublishedFantasyLeaderboard(searchParams?.round || null, seasonContext.selected?.id || null);
  } catch (err) {
    console.error('[fantasy/leaderboard] Failed to load published leaderboard; showing failure state:', err);
    loadFailed = true;
    leaderboard = { rows: [], rounds: [], selectedRoundId: null };
  }

  const selectedRound = leaderboard.rounds.find((round) => round.id === leaderboard.selectedRoundId);

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <span className="eyebrow-gold">{CLUB_SHORT} Dino Coach</span>
          <h1 className="page-hero-title">Player Leaderboard</h1>
          <p className="page-hero-subtitle">
            Published fantasy import batches only. Draft, reviewed, and rejected imports are never shown here.
          </p>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          <FantasyBackLink />

          <div className="mb-6 flex flex-wrap items-center gap-3">
            <SeasonSelector seasons={seasonContext.options} selectedSlug={seasonContext.selected?.slug || ''} />
            {seasonContext.selected && (
              <span className="rounded-full bg-maroon-50 dark:bg-maroon-950 px-3 py-1 text-xs font-body text-maroon-700 dark:text-maroon-200">{seasonContext.selected.name} · {seasonStatusLabel(seasonContext.selected)}</span>
            )}
          </div>

          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-display font-bold text-content-primary flex items-center gap-2">
                    <Trophy className="h-6 w-6 text-maroon-700 dark:text-maroon-200" aria-hidden="true" />
                    {selectedRound ? `Round ${selectedRound.roundNumber}: ${selectedRound.name}` : 'All rounds'}
                  </h2>
                  <p className="text-content-muted font-body mt-1">Totals are recalculated from the current Dino Coach scoring rules.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={roundHref(null, searchParams?.season)} className={`px-4 py-2 rounded-md font-body font-semibold text-sm ${!leaderboard.selectedRoundId ? 'bg-maroon-700 text-white' : 'border border-maroon-700 text-maroon-700 dark:text-maroon-200 hover:bg-maroon-50'}`}>
                    All rounds
                  </Link>
                  {leaderboard.rounds.map((round) => (
                    <Link key={round.id} href={roundHref(round.id, searchParams?.season)} className={`px-4 py-2 rounded-md font-body font-semibold text-sm ${leaderboard.selectedRoundId === round.id ? 'bg-maroon-700 text-white' : 'border border-maroon-700 text-maroon-700 dark:text-maroon-200 hover:bg-maroon-50'}`}>
                      Round {round.roundNumber}
                    </Link>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {loadFailed ? (
            <DataLoadErrorCard
              title="We couldn&rsquo;t load the leaderboard"
              retryHref={roundHref(searchParams?.round || null, searchParams?.season)}
              backHref="/fantasy"
              backLabel="Back to Dino Coach"
            />
          ) : leaderboard.rows.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <h2 className="text-xl font-display font-bold text-content-primary mb-2">No published scores yet</h2>
                <p className="text-content-secondary font-body">The leaderboard will appear after NDCC publishes an approved fantasy import batch.</p>
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
                    <TableCell className="font-bold text-maroon-800 dark:text-maroon-200">{row.totalFantasyPoints}</TableCell>
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
