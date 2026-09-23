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
    <section className="band-maroon section-padding">
      <div className="container-width">
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">Player Sponsors</h1>
        <p className="mt-4 max-w-2xl text-lg text-white">Meet the businesses supporting our players. Explore their logos and visit their websites to support them in return.</p>
        <Link href="/sponsors" className="mt-6 inline-block font-semibold text-white underline underline-offset-4">View club sponsors</Link>
      </div>
    </section>
    <PlayerSponsorsSection />
  </>;
}
