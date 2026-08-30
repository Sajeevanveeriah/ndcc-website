import type { Metadata } from 'next';
import Link from 'next/link';
import Card, { CardContent } from '@/components/ui/Card';
import { CLUB_SHORT } from '@/lib/constants';
import { FANTASY_RULE_SECTIONS } from '@/lib/fantasy';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
import SeasonSelector from '@/components/fantasy/SeasonSelector';
import { getSeasonPageContext } from '@/lib/fantasy-seasons';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dino Coach Rules',
  description: 'Current-season Dino Coach rules.',
};

export default async function FantasyRulesPage({ searchParams: searchParamsPromise }: { searchParams?: Promise<{ season?: string }> }) {
  const searchParams = await searchParamsPromise;
  const seasonContext = await getSeasonPageContext(searchParams?.season || null).catch(() => ({ seasons: [], selected: null, options: [] }));
  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <span className="eyebrow-gold">{CLUB_SHORT} Dino Coach</span>
          <h1 className="page-hero-title">Dino Coach Rules</h1>
          <p className="page-hero-subtitle">
            Current rules for entry, squads, scoring, transfers, pricing and prizes.
          </p>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          <FantasyBackLink />
          <div className="mb-6"><SeasonSelector seasons={seasonContext.options} selectedSlug={seasonContext.selected?.slug || ''} /></div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {FANTASY_RULE_SECTIONS.map((section) => (
                  <Card key={section.title}>
                    <CardContent className="p-6 md:p-8">
                      <h2 className="text-2xl font-display font-bold text-maroon-800 dark:text-maroon-200 mb-4">{section.title}</h2>
                      <ul className="space-y-3 text-content-secondary font-body leading-relaxed list-disc pl-5">
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
                  <h2 className="text-xl font-display font-bold text-content-primary mb-3">Pilot and versioning</h2>
                  <p className="text-content-secondary font-body leading-relaxed mb-4">
                    Managers accept a specific rules version during registration. Material changes are communicated and recorded rather than silently changing accepted terms.
                  </p>
                  <Link href="/fantasy" className="btn-secondary w-full">
                    Dino Coach home
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
