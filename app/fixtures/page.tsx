import type { Metadata } from 'next';
import Link from 'next/link';
import Card, { CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { PLAYHQ_ORG_URL, CLUB_NICKNAME, FACEBOOK_URL } from '@/lib/constants';
import { getContentBlocks } from '@/lib/content-blocks';
import { getPageLinkCards } from '@/lib/structured-content';

export const metadata: Metadata = {
  title: 'Fixtures & Results',
};

export default async function FixturesPage() {
  const [blocks, teamLinks] = await Promise.all([
    getContentBlocks(['fixtures.hero', 'fixtures.status', 'fixtures.team_links']),
    getPageLinkCards('fixtures', 'team_links'),
  ]);

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">{blocks['fixtures.hero']?.title || 'Fixtures & Results'}</h1>
          <p className="page-hero-subtitle">
            {blocks['fixtures.hero']?.body || `Follow the ${CLUB_NICKNAME} throughout the season across all grades.`}
          </p>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          <Card className="border-l-4 border-l-maroon-700">
            <CardContent className="p-8">
              <h2 className="text-2xl font-display font-bold text-gray-900 mb-3">
                {blocks['fixtures.status']?.title || 'Season Status'}
              </h2>
              <p className="text-gray-700 font-body leading-relaxed mb-4 max-w-3xl">
                {blocks['fixtures.status']?.body || `Keep track of upcoming fixtures, results, and ladder updates for the ${CLUB_NICKNAME}.`}{' '}
                <Link href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="text-maroon-700 hover:underline font-semibold">
                  Facebook page
                </Link>.
              </p>
              <Link
                href={blocks['fixtures.status']?.cta_url || PLAYHQ_ORG_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary inline-flex items-center"
              >
                {blocks['fixtures.status']?.cta_label || 'View Results on PlayHQ'}
                <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="section-padding bg-sky-50">
        <div className="container-width">
          <h2 className="section-title mb-8">{blocks['fixtures.team_links']?.title || 'Team Fixtures on PlayHQ'}</h2>
          <p className="text-gray-600 font-body mb-8 max-w-3xl">
            {blocks['fixtures.team_links']?.body || 'Quick links to each NDCC team fixture page on PlayHQ.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {teamLinks.map((team) => (
              <a
                key={team.id}
                href={team.href}
                target={team.is_external ? '_blank' : undefined}
                rel={team.is_external ? 'noopener noreferrer' : undefined}
                className="block group"
              >
                <Card hover className="h-full">
                  <div className="bg-gradient-to-br from-maroon-700 to-maroon-900 px-6 py-4">
                    <h3 className="text-white font-display font-bold text-lg">{team.title}</h3>
                  </div>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <Badge variant="default">{team.badge || team.description}</Badge>
                      <span className="text-maroon-700 font-body text-sm font-semibold group-hover:underline inline-flex items-center">
                        {blocks['fixtures.team_links']?.cta_label || 'View on PlayHQ'}
                        <svg className="ml-1 w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
