import type { Metadata } from 'next';
import Link from 'next/link';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
import ManagerTeamView from '../../_components/ManagerTeamView';

export const dynamic = 'force-dynamic';
// Teams are private to their own manager, so the page is never indexed.
export const metadata: Metadata = { title: 'Dino Coach Team', description: 'View your own Dino Coach squad. Teams are private to their manager.', robots: { index: false, follow: false } };

export default async function FantasyManagerTeamPage({ params, searchParams }: { params: Promise<{ managerId: string }>; searchParams?: Promise<{ season?: string }> }) {
  const [{ managerId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const season = resolvedSearchParams?.season ? `?season=${encodeURIComponent(resolvedSearchParams.season)}` : '';
  return <section className="section-padding"><div className="container-width"><FantasyBackLink /><h1 className="section-title">My Team</h1><p className="font-body text-content-secondary mb-2">Your playing XI, bench, captain picks and prices. Dino Coach teams are private: only you can see your team, and you cannot see other managers&rsquo; teams.</p><p className="mb-6"><Link href={`/fantasy/manager-leaderboard${season}`} className="font-body font-semibold text-maroon-700 hover:underline dark:text-maroon-200">Back to Manager Standings</Link></p><ManagerTeamView managerId={managerId} /></div></section>;
}
