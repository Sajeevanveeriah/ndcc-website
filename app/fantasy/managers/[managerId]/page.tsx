import type { Metadata } from 'next';
import Link from 'next/link';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
import ManagerTeamView from '../../_components/ManagerTeamView';

export const dynamic = 'force-dynamic';
// Manager teams are for signed-in managers only, so the page is never indexed.
export const metadata: Metadata = { title: 'Dino Coach Team', description: 'View another Dino Coach manager’s squad after the round deadline.', robots: { index: false, follow: false } };

export default async function FantasyManagerTeamPage({ params, searchParams }: { params: Promise<{ managerId: string }>; searchParams?: Promise<{ season?: string }> }) {
  const [{ managerId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const season = resolvedSearchParams?.season ? `?season=${encodeURIComponent(resolvedSearchParams.season)}` : '';
  return <section className="section-padding"><div className="container-width"><FantasyBackLink /><h1 className="section-title">Manager Team</h1><p className="font-body text-content-secondary mb-2">See another manager&rsquo;s playing XI, bench, captain picks and prices. Teams are revealed once the round deadline passes, so nobody can copy picks before it.</p><p className="mb-6"><Link href={`/fantasy/manager-leaderboard${season}`} className="font-body font-semibold text-maroon-700 hover:underline dark:text-maroon-200">Back to Manager Standings</Link></p><ManagerTeamView managerId={managerId} /></div></section>;
}
