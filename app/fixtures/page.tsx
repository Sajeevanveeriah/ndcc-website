import type { Metadata } from 'next';
import Link from 'next/link';
import Card, { CardContent } from '@/components/ui/Card';
import { PLAYHQ_ORG_URL, CLUB_NICKNAME } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Fixtures & Results',
};

interface PlayHQFixture {
  round: string;
  date: string;
  opponent: string;
  venue: string;
  result: string;
}

async function getFixtures(): Promise<PlayHQFixture[]> {
  if (!process.env.PLAYHQ_API_KEY || !process.env.PLAYHQ_ORG_ID) {
    return [];
  }

  try {
    const res = await fetch(
      `https://api.playhq.com/v1/organisations/${process.env.PLAYHQ_ORG_ID}/seasons`,
      {
        headers: {
          'x-api-key': process.env.PLAYHQ_API_KEY,
          'x-phq-tenant': 'ca',
        },
        next: { revalidate: 3600 },
      }
    );

    if (!res.ok) return [];

    const seasons = await res.json();
    if (!seasons?.data?.length) return [];

    const currentSeason = seasons.data[0];
    const gradesRes = await fetch(
      `https://api.playhq.com/v1/seasons/${currentSeason.id}/grades`,
      {
        headers: {
          'x-api-key': process.env.PLAYHQ_API_KEY,
          'x-phq-tenant': 'ca',
        },
        next: { revalidate: 3600 },
      }
    );

    if (!gradesRes.ok) return [];

    const grades = await gradesRes.json();
    if (!grades?.data?.length) return [];

    const fixtures: PlayHQFixture[] = [];
    for (const grade of grades.data.slice(0, 3)) {
      const fixturesRes = await fetch(
        `https://api.playhq.com/v1/grades/${grade.id}/fixtures`,
        {
          headers: {
            'x-api-key': process.env.PLAYHQ_API_KEY,
            'x-phq-tenant': 'ca',
          },
          next: { revalidate: 3600 },
        }
      );

      if (!fixturesRes.ok) continue;

      const fixtureData = await fixturesRes.json();
      if (fixtureData?.data) {
        for (const f of fixtureData.data) {
          fixtures.push({
            round: f.round?.name || '',
            date: f.date || '',
            opponent: f.awayTeam?.name || f.homeTeam?.name || '',
            venue: f.venue?.name || '',
            result: f.status || 'Upcoming',
          });
        }
      }
    }

    return fixtures;
  } catch {
    return [];
  }
}

export default async function FixturesPage() {
  const fixtures = await getFixtures();
  const hasPlayHQCredentials = Boolean(process.env.PLAYHQ_API_KEY && process.env.PLAYHQ_ORG_ID);

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

      {/* PlayHQ CTA */}
      <section className="section-padding">
        <div className="container-width">
          <Card className="border-l-4 border-l-maroon-700">
            <CardContent className="p-8">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-display font-bold text-gray-900 mb-2">
                    Results on PlayHQ
                  </h2>
                  <p className="text-gray-700 font-body leading-relaxed max-w-2xl">
                    Full fixtures, live scores, ladders, and match results are managed through
                    PlayHQ - the official platform of Cricket Australia and the Geelong Cricket
                    Association. Visit PlayHQ for the most up-to-date information.
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <Link
                    href={PLAYHQ_ORG_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary whitespace-nowrap"
                  >
                    View on PlayHQ
                    <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Fixtures from PlayHQ API (only shown when credentials configured and data exists) */}
      {hasPlayHQCredentials && fixtures.length > 0 && (
        <section className="section-padding bg-gray-50">
          <div className="container-width">
            <h2 className="section-title mb-8">Upcoming Fixtures</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {fixtures.slice(0, 9).map((fixture, i) => (
                <Card key={i} className="border-l-4 border-l-maroon-700">
                  <CardContent className="p-6">
                    {fixture.round && (
                      <span className="inline-block bg-maroon-50 text-maroon-700 text-xs font-body font-semibold px-2 py-1 rounded mb-3">
                        {fixture.round}
                      </span>
                    )}
                    <p className="text-sm text-gray-500 font-body mb-1">{fixture.date}</p>
                    <h3 className="text-lg font-display font-bold text-gray-900 mb-1">
                      {fixture.opponent}
                    </h3>
                    <p className="text-sm text-gray-600 font-body">{fixture.venue}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
