import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';
import Link from 'next/link';
import PlayerSponsorsSection from '@/components/home/PlayerSponsorsSection';

// ISR: regenerated at most every 60s and on demand after admin writes
// (lib/server/revalidate-public.ts). 'force-static' lets the Supabase reads,
// which use cache: 'no-store' fetches, run during static regeneration instead
// of opting the route into per-request rendering. This route reads no
// cookies, headers or searchParams.
export const dynamic = 'force-static';
export const revalidate = 60;
export const metadata: Metadata = pageMetadata("/player-sponsors", "Player sponsors", "Meet the businesses supporting Newcomb and District Cricket Club players.");

export default function PlayerSponsorsPage() {
  return <>
    <section className="page-hero">
      <div className="container-width">
        <h1 className="page-hero-title">Player Sponsors</h1>
        <p className="page-hero-subtitle">Meet the businesses supporting our players. Explore their logos and visit their websites to support them in return.</p>
        <Link href="/sponsors" className="mt-6 inline-block font-semibold text-white underline underline-offset-4">View club sponsors</Link>
      </div>
    </section>
    <PlayerSponsorsSection />
  </>;
}
