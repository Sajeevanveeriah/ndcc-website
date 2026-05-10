import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import Card, { CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { getContentBlocks } from '@/lib/content-blocks';
import { getTeams } from '@/lib/cms-content';

const TEAM_IMAGES: Record<string, string> = {
  'Senior Women': '/images/Womens_Team.jpg',
};

export const metadata: Metadata = {
  title: 'Teams',
};

export default async function TeamsPage() {
  const [teams, blocks] = await Promise.all([
    getTeams(),
    getContentBlocks(['teams.hero', 'teams.coach', 'teams.join_cta']),
  ]);
  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">{blocks['teams.hero']?.title || ''}</h1>
          <p className="page-hero-subtitle">
            {blocks['teams.hero']?.body || ''}
          </p>
        </div>
      </section>

      {/* Head Coach */}
      <section className="section-padding bg-gray-50">
        <div className="container-width">
          <Card className="border-l-4 border-l-maroon-700">
            <CardContent className="p-8">
              <h2 className="text-2xl font-display font-bold text-gray-900 mb-2">
                {blocks['teams.coach']?.title || ''}
              </h2>
              <p className="text-gray-700 font-body leading-relaxed max-w-3xl">
                {blocks['teams.coach']?.body || ''}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Teams */}
      <section className="section-padding">
        <div className="container-width">
          <div className="space-y-12">
            {teams.map((team, index) => (
              <Card key={team.name} className="overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-3">
                  {/* Team image or colour block */}
                  {TEAM_IMAGES[team.name] ? (
                    <div className="relative min-h-[200px] md:min-h-0">
                      <Image
                        src={TEAM_IMAGES[team.name]}
                        alt={`${team.name} team photo`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />
                      <div className="absolute inset-0 bg-maroon-900/40 flex items-end p-6">
                        <div className="text-white">
                          <h2 className="text-2xl font-display font-bold mb-1">{team.name}</h2>
                          <Badge className="bg-white/20 text-white border border-white/30">
                            {team.grade}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`flex items-center justify-center p-8 md:p-12 ${
                        index % 2 === 0
                          ? 'bg-gradient-to-br from-maroon-700 to-maroon-900'
                          : 'bg-gradient-to-br from-maroon-600 to-maroon-800'
                      }`}
                    >
                      <div className="text-center text-white">
                        <h2 className="text-3xl font-display font-bold mb-2">{team.name}</h2>
                        <Badge className="bg-white/20 text-white border border-white/30">
                          {team.grade}
                        </Badge>
                      </div>
                    </div>
                  )}
                  {/* Team details */}
                  <CardContent className="md:col-span-2 p-8">
                    <div className="flex items-start gap-3 mb-4">
                      <Badge>{team.grade}</Badge>
                    </div>
                    <p className="text-gray-700 font-body leading-relaxed mb-4">
                      {team.description}
                    </p>
                    {team.captain && (
                      <p className="text-sm text-gray-500 font-body mb-4">
                        <span className="font-semibold">Captain:</span> {team.captain}
                      </p>
                    )}
                    {team.playhq_url && (
                      <a
                        href={team.playhq_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary text-sm inline-flex items-center"
                      >
                        View on PlayHQ
                        <svg className="ml-2 w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </a>
                    )}
                  </CardContent>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Join CTA */}
      <section className="section-padding bg-gradient-to-br from-maroon-700 to-maroon-900 text-white">
        <div className="container-width text-center">
          <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">
            {blocks['teams.join_cta']?.title || ''}
          </h2>
          <p className="text-maroon-100 font-body text-lg max-w-2xl mx-auto mb-8">
            {blocks['teams.join_cta']?.body || ''}
          </p>
          <Link href={blocks['teams.join_cta']?.cta_url || '/contact'} className="btn-accent text-lg px-8 py-4">
            {blocks['teams.join_cta']?.cta_label || ''}
          </Link>
        </div>
      </section>
    </>
  );
}
