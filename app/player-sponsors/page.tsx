import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';
import Link from 'next/link';
import PlayerSponsorsSection from '@/components/home/PlayerSponsorsSection';
import WinnerCard from '@/components/match-day/WinnerCard';
import { getPublishedWinners } from '@/lib/server/match-day';

// ISR: regenerated at most every 60s and on demand after admin writes
// (lib/server/revalidate-public.ts). 'force-static' lets the Supabase reads,
// which use cache: 'no-store' fetches, run during static regeneration instead
// of opting the route into per-request rendering. This route reads no
// cookies, headers or searchParams.
export const dynamic = 'force-static';
export const revalidate = 60;
export const metadata: Metadata = pageMetadata("/player-sponsors", "Player sponsors", "Meet the businesses supporting Newcomb and District Cricket Club players.");

export default async function PlayerSponsorsPage() {
  const awards = await getPublishedWinners({ category: 'player_sponsor_award', limit: 6 }).catch(() => []);
  return <>
    <section className="page-hero">
      <div className="container-width">
        <h1 className="page-hero-title">Player Sponsors</h1>
        <p className="page-hero-subtitle">Meet the businesses supporting our players. Explore their logos and visit their websites to support them in return.</p>
        <Link href="/sponsors" className="mt-6 inline-block font-semibold text-white underline underline-offset-4">View club sponsors</Link>
      </div>
    </section>
    {awards.length > 0 && <section className="section-padding bg-surface-page" aria-labelledby="awards-heading">
      <div className="container-width space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="awards-heading" className="section-title mb-0">Latest player sponsor awards</h2>
          <Link href="/winners?category=player_sponsor_award" className="font-semibold text-content-blue underline underline-offset-4">All awards</Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">{awards.map((award) => <WinnerCard key={award.id} winner={award} />)}</div>
      </div>
    </section>}
    <PlayerSponsorsSection />
  </>;
}
