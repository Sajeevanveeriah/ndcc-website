import type { Metadata } from 'next';
import Link from 'next/link';
import Card, { CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { PLAYHQ_URL, CLUB_NICKNAME } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Fixtures & Results',
};

const placeholderFixtures = [
  {
    round: 'Round 10',
    date: '15 Feb 2025',
    opponent: 'Lara Cricket Club',
    venue: 'Grinter Reserve',
    result: 'Upcoming',
  },
  {
    round: 'Round 11',
    date: '22 Feb 2025',
    opponent: 'Manifold Heights CC',
    venue: 'Queens Park (Away)',
    result: 'Upcoming',
  },
  {
    round: 'Round 12',
    date: '1 Mar 2025',
    opponent: 'North Shore CC',
    venue: 'Grinter Reserve',
    result: 'Upcoming',
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

      {/* PlayHQ Notice */}
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
                    PlayHQ — the official platform of Cricket Australia and the Geelong Cricket
                    Association. Visit PlayHQ for the most up-to-date information.
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <Link
                    href={PLAYHQ_URL}
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

      {/* Fixtures Table */}
      <section className="section-padding bg-gray-50">
        <div className="container-width">
          <h2 className="section-title mb-8">Upcoming Fixtures</h2>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Round</TableHeader>
                <TableHeader>Date</TableHeader>
                <TableHeader>Opponent</TableHeader>
                <TableHeader>Venue</TableHeader>
                <TableHeader>Result</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {placeholderFixtures.map((fixture) => (
                <TableRow key={fixture.round}>
                  <TableCell>
                    <span className="font-semibold">{fixture.round}</span>
                  </TableCell>
                  <TableCell>{fixture.date}</TableCell>
                  <TableCell>{fixture.opponent}</TableCell>
                  <TableCell>{fixture.venue}</TableCell>
                  <TableCell>
                    <Badge variant="info">{fixture.result}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-6 text-center">
            <p className="text-gray-500 font-body text-sm italic">
              Full fixture integration coming soon. Visit PlayHQ for complete and up-to-date fixtures.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
