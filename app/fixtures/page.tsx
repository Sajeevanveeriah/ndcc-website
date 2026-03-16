import type { Metadata } from 'next';
import Link from 'next/link';
import Card, { CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { PLAYHQ_ORG_URL, CLUB_NICKNAME, FACEBOOK_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Fixtures & Results',
};

const teamPlayHQLinks = [
  {
    name: '1st XI',
    grade: 'GCA Grade 4',
    url: 'https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c/geelong-cricket-association-mens-competition-summer-202526/teams/newcomb-and-district-1sts/0f74d5e7',
  },
  {
    name: '2nd XI',
    grade: 'GCA Grade 4',
    url: PLAYHQ_ORG_URL,
  },
  {
    name: '3rd XI',
    grade: 'GCA Hard Wicket',
    url: PLAYHQ_ORG_URL,
  },
  {
    name: 'Senior Women',
    grade: 'GCA E Grade East',
    url: PLAYHQ_ORG_URL,
  },
  {
    name: 'Juniors',
    grade: 'GCA Junior Competition',
    url: PLAYHQ_ORG_URL,
  },
];

export default function FixturesPage() {
  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">Fixtures &amp; Results</h1>
          <p className="page-hero-subtitle">
            Follow the {CLUB_NICKNAME} throughout the season across all grades.
          </p>
        </div>
      </section>

      {/* Season Status */}
      <section className="section-padding">
        <div className="container-width">
          <Card className="border-l-4 border-l-maroon-700">
            <CardContent className="p-8">
              <h2 className="text-2xl font-display font-bold text-gray-900 mb-3">
                2025/26 Season Complete
              </h2>
              <p className="text-gray-700 font-body leading-relaxed mb-4 max-w-3xl">
                The 2025/26 GCA season has concluded. You can view full results, ladders, and match
                details from the completed season on PlayHQ. The 2026/27 season begins in October 2026.
                Pre-season training details will be announced on our{' '}
                <Link href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="text-maroon-700 hover:underline font-semibold">
                  Facebook page
                </Link>.
              </p>
              <Link
                href={PLAYHQ_ORG_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary inline-flex items-center"
              >
                View 2025/26 Results on PlayHQ
                <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Team Links */}
      <section className="section-padding bg-gray-50">
        <div className="container-width">
          <h2 className="section-title mb-8">Team Fixtures on PlayHQ</h2>
          <p className="text-gray-600 font-body mb-8 max-w-3xl">
            View fixtures, results, and ladders for each NDCC team on PlayHQ. Links below go to
            the 2025/26 season pages. Updated links for 2026/27 will be added when the new season
            draw is published.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {teamPlayHQLinks.map((team) => (
              <a
                key={team.name}
                href={team.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <Card hover className="h-full">
                  <div className="bg-gradient-to-br from-maroon-700 to-maroon-900 px-6 py-4">
                    <h3 className="text-white font-display font-bold text-lg">{team.name}</h3>
                  </div>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <Badge variant="default">{team.grade}</Badge>
                      <span className="text-maroon-700 font-body text-sm font-semibold group-hover:underline inline-flex items-center">
                        View on PlayHQ
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
