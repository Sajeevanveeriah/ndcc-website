import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import Card, { CardContent } from '@/components/ui/Card';
import { CLUB_SHORT } from '@/lib/constants';
import { FANTASY_RULE_SECTIONS } from '@/lib/fantasy';

export const metadata: Metadata = {
  title: 'Fantasy Cricket Rules',
  description: 'Rules foundation for NDCC Fantasy Cricket.',
};

export default function FantasyRulesPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <p className="text-sm font-body font-semibold uppercase tracking-[0.25em] text-maroon-100 mb-3">
            {CLUB_SHORT} Fantasy Cricket
          </p>
          <h1 className="page-hero-title">Fantasy Cricket Rules</h1>
          <p className="page-hero-subtitle">
            How NDCC Fantasy Cricket squads, transfers, chips, scores, leagues, and leaderboards work.
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {FANTASY_RULE_SECTIONS.map((section) => (
                <Card key={section.title}>
                  <CardContent className="p-6 md:p-8">
                    <h2 className="text-2xl font-display font-bold text-maroon-800 mb-4">{section.title}</h2>
                    <ul className="space-y-3 text-gray-700 font-body leading-relaxed list-disc pl-5">
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>

            <aside className="lg:sticky lg:top-24 h-fit">
              <Card className="border-l-4 border-l-maroon-700">
                <CardContent className="p-6">
                  <h2 className="text-xl font-display font-bold text-gray-900 mb-3">MVP note</h2>
                  <p className="text-gray-700 font-body leading-relaxed mb-4">
                    Free Hit is recorded safely for this MVP, but temporary squad restoration is not automated. Other chips listed here affect score calculation when used for a round.
                  </p>
                  <Link href="/fantasy" className="btn-secondary w-full">
                    Fantasy Home
                  </Link>
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
