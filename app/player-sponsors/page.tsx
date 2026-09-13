import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';
import Link from 'next/link';
import PlayerSponsorsSection from '@/components/home/PlayerSponsorsSection';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
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
