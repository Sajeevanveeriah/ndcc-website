import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import Card, { CardContent } from '@/components/ui/Card';
import { CLUB_NICKNAME, CLUB_SHORT } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Fantasy Cricket',
  description: 'NDCC Fantasy Cricket foundation for club rules and future squad, transfer, league, and leaderboard features.',
};

export default function FantasyPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <p className="text-sm font-body font-semibold uppercase tracking-[0.25em] text-maroon-100 mb-3">
            {CLUB_SHORT} Dinos
          </p>
          <h1 className="page-hero-title">Fantasy Cricket</h1>
          <p className="page-hero-subtitle">
            A club-branded foundation for NDCC fantasy cricket rules, with space for future squad, transfer, league, and leaderboard features.
          </p>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <h2 className="section-title">Built for the {CLUB_NICKNAME}</h2>
              <div className="space-y-4 text-gray-700 font-body leading-relaxed max-w-3xl">
                <p>
                  NDCC Fantasy Cricket is being prepared as a club-first experience for members, players, families, and supporters. This foundation release publishes the core entry point and rules area without opening squad selection, transfers, leagues, or leaderboard data before they are approved.
                </p>
                <p>
                  The structure keeps future fantasy features separate from existing public pages, admin pages, CMS content, orders, payments, media uploads, and API routes.
                </p>
              </div>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link href="/fantasy/rules" className="btn-primary">
                  Read Rules
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>

            <Card className="border-l-4 border-l-maroon-700">
              <CardContent className="p-6">
                <ShieldCheck className="h-10 w-10 text-maroon-700 mb-4" aria-hidden="true" />
                <h2 className="text-2xl font-display font-bold text-gray-900 mb-3">Foundation scope</h2>
                <ul className="space-y-3 text-sm text-gray-700 font-body leading-relaxed">
                  <li>NDCC colours, language, and club identity only.</li>
                  <li>No third-party fantasy branding, logos, protected copy, images, or copied interface patterns.</li>
                  <li>No sample squads, fake scores, invented player data, or public competition standings.</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="section-padding bg-sky-50">
        <div className="container-width">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
            <div className="lg:col-span-2">
              <p className="text-sm font-body font-semibold uppercase tracking-[0.25em] text-maroon-700 mb-3">
                Competition coming soon
              </p>
              <h2 className="section-title">Fantasy Cricket is being prepared</h2>
              <div className="space-y-4 text-gray-700 font-body leading-relaxed max-w-3xl">
                <p>
                  The public fantasy competition will open only after NDCC confirms the season format, player eligibility, scoring approach, and competition administration process.
                </p>
                <p>
                  Until then, this area keeps the rules foundation available while future squad, transfer, league, and leaderboard features remain unpublished.
                </p>
              </div>
            </div>

            <Card className="bg-white">
              <CardContent className="p-6">
                <h3 className="text-xl font-display font-bold text-maroon-800 mb-3">What is live now?</h3>
                <p className="text-gray-700 font-body leading-relaxed mb-5">
                  The Fantasy Cricket landing page and rules foundation are available for members and supporters to review.
                </p>
                <Link href="/fantasy/rules" className="btn-secondary w-full">
                  View Rules
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          <Card className="bg-maroon-800 border-maroon-800 text-white">
            <CardContent className="p-8 md:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-display font-bold uppercase tracking-wide mb-3">Rules before play</h2>
                <p className="text-maroon-100 font-body leading-relaxed max-w-2xl">
                  Review the rules foundation before future fantasy features are connected to approved NDCC player, scoring, league, and leaderboard settings.
                </p>
              </div>
              <Link href="/fantasy/rules" className="btn-accent shrink-0">
                Read Rules
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
