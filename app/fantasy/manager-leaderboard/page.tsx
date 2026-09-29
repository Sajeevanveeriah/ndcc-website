import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import Card, { CardContent } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
import DataLoadErrorCard from '@/components/common/DataLoadErrorCard';
import SeasonSelector from '@/components/fantasy/SeasonSelector';
import { getCachedManagerStandings, getCachedSeasonPageContext } from '@/lib/server/dino-public-cache';
import type { DinoManagerStanding } from '@/lib/dino-coach/standings';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMetadata('/fantasy/manager-leaderboard', 'Dino Coach Manager Leaderboard', 'Manager Standings rank the people playing Dino Coach by the points earned by their selected playing XI.');

export default async function FantasyManagerLeaderboardPage({ searchParams: searchParamsPromise }: { searchParams?: Promise<{ season?: string }> }) {
  const searchParams = await searchParamsPromise;
  const seasonContext = await getCachedSeasonPageContext(searchParams?.season || null).catch(() => ({ seasons: [], selected: null, options: [] }));
  let rows: DinoManagerStanding[] = [];
  let loadFailed = false;
  try {
    rows = await getCachedManagerStandings(seasonContext.selected?.id || null);
  } catch (err) {
    console.error('[fantasy/manager-leaderboard] Failed to load manager round scores; showing failure state:', err);
    loadFailed = true;
  }
  const seasonQuery = searchParams?.season ? `?season=${encodeURIComponent(searchParams.season)}` : '';
  return <section className="section-padding"><div className="container-width"><FantasyBackLink /><h1 className="section-title">Manager Standings</h1><p className="font-body text-content-secondary mb-4">Manager Standings rank the people playing Dino Coach by the points earned by their selected playing XI, including fantasy-slot scoring and captain and vice-captain bonuses. Bench players score only when covering an empty playing slot of the same role. Points ties are decided by current squad market value, then team name. Signed-in managers can open a team to see its players once team selection closes for the round.</p><div className="mb-6"><SeasonSelector seasons={seasonContext.options} selectedSlug={seasonContext.selected?.slug || ''} /></div>{loadFailed ? <DataLoadErrorCard title="We couldn&rsquo;t load the manager leaderboard" retryHref="/fantasy/manager-leaderboard" backHref="/fantasy" backLabel="Back to Dino Coach" /> : rows.length === 0 ? <Card><CardContent className="p-8 text-center"><h2 className="text-xl font-display font-bold text-content-primary mb-2">No manager scores yet</h2><p className="font-body text-content-secondary">The manager leaderboard appears after the committee publishes round scores.</p></CardContent></Card> : <Table><TableHead><TableRow><TableHeader>Rank</TableHeader><TableHeader>Team</TableHeader><TableHeader>Manager</TableHeader><TableHeader>Total points</TableHeader><TableHeader>Squad value</TableHeader></TableRow></TableHead><TableBody>{rows.map((row)=><TableRow key={row.managerId}><TableCell className="font-bold">{row.rank}</TableCell><TableCell><Link href={`/fantasy/managers/${row.managerId}${seasonQuery}`} className="font-semibold text-maroon-700 hover:underline dark:text-maroon-200">{row.teamName}</Link></TableCell><TableCell>{row.displayName}</TableCell><TableCell className="font-bold text-maroon-800 dark:text-maroon-200">{row.totalPoints}</TableCell><TableCell>{row.squadValueDinoDollars ? `${row.squadValueDinoDollars.toLocaleString()} Dino Dollars` : 'Not available'}</TableCell></TableRow>)}</TableBody></Table>}</div></section>;
}
