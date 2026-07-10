import type { Metadata } from 'next';
import Link from 'next/link';
import Card, { CardContent } from '@/components/ui/Card';
import { CLUB_SHORT } from '@/lib/constants';
import { FANTASY_RULE_SECTIONS } from '@/lib/fantasy';
import { getContentBlocks } from '@/lib/content-blocks';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
import SeasonSelector from '@/components/fantasy/SeasonSelector';
import { getSeasonPageContext } from '@/lib/fantasy-seasons';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fantasy Cricket Rules',
  description: 'Rules foundation for NDCC Fantasy Cricket.',
};

export default async function FantasyRulesPage({ searchParams }: { searchParams?: { season?: string } }) {
  const seasonContext = await getSeasonPageContext(searchParams?.season || null).catch(() => ({ seasons: [], selected: null, options: [] }));
  const blocks = await getContentBlocks(['fantasy.rules']);
  const rulesBlock = blocks['fantasy.rules'];
  const rulesBody = rulesBlock?.body?.trim() || null;
  const rulesParagraphs = rulesBody
    ? rulesBody.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : [];

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <span className="eyebrow-gold">{CLUB_SHORT} Fantasy Cricket</span>
          <h1 className="page-hero-title">Fantasy Cricket Rules</h1>
          <p className="page-hero-subtitle">
            How NDCC Fantasy Cricket squads, transfers, chips, scores, leagues, and leaderboards work.
          </p>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          <FantasyBackLink />
          <div className="mb-6"><SeasonSelector seasons={seasonContext.options} selectedSlug={seasonContext.selected?.slug || ''} /></div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {rulesParagraphs.length > 0 ? (
                <Card>
                  <CardContent className="p-6 md:p-8">
                    <h2 className="text-2xl font-display font-bold text-maroon-800 mb-4">{rulesBlock?.title || 'Fantasy Cricket Rules'}</h2>
                    <div className="space-y-3 text-gray-700 font-body leading-relaxed">
                      {rulesParagraphs.map((paragraph, index) => (
                        <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                FANTASY_RULE_SECTIONS.map((section) => (
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
                ))
              )}
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
