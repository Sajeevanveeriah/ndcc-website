import type { Metadata } from 'next';
import Link from 'next/link';
import SafeImage from '@/components/common/SafeImage';
import ScrollReveal from '@/components/common/ScrollReveal';
import Card, { CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { TEAMS, CLUB_NICKNAME } from '@/lib/constants';
import { createServerClient } from '@/lib/supabase-server';
import type { TeamInfo } from '@/lib/types';

const TEAM_IMAGES: Record<string, string> = {
  'Senior Women': '/images/Womens_Team.jpg',
};

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Teams',
};

async function getTeams(): Promise<TeamInfo[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return TEAMS;
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('teams')
      .select('id, name, grade, description, captain, playhq_url, image_url, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) return TEAMS;
    return (data as TeamInfo[]) || [];
  } catch {
    return TEAMS;
  }
}

export default async function TeamsPage() {
  const teams = await getTeams();

  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <ScrollReveal onMount delay={0}>
            <h1 className="page-hero-title">Our Teams</h1>
          </ScrollReveal>
          <ScrollReveal onMount delay={0.15}>
            <p className="page-hero-subtitle">
              Meet the squads representing the {CLUB_NICKNAME} across all grades of the GCA.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* Head Coach */}
      <section className="section-padding bg-gray-50">
        <div className="container-width">
          <Card className="border-l-4 border-l-maroon-700">
            <CardContent className="p-8">
              <h2 className="text-2xl font-display font-bold text-gray-900 mb-2">
                Head Coach: Craig Hillgrove
              </h2>
              <p className="text-gray-700 font-body leading-relaxed max-w-3xl">
                Craig oversees coaching across all senior and junior teams at NDCC, working with
                team captains and assistant coaches to develop players at every level. If you are
                interested in joining the club or have questions about training, get in touch via
                the{' '}
                <Link href="/contact" className="text-maroon-700 hover:underline font-semibold">
                  contact page
                </Link>.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Teams */}
      <section className="section-padding">
        <div className="container-width">
          <div className="space-y-12">
            {teams.map((team, index) => {
              const teamImage = team.image_url || TEAM_IMAGES[team.name];

              return (
                <Card key={team.id || team.name} className="overflow-hidden">
                  <div className="grid grid-cols-1 md:grid-cols-3">
                    {/* Team image or colour block */}
                    {teamImage ? (
                      <div className="relative min-h-[200px] md:min-h-0">
                        <SafeImage
                          src={teamImage}
                          alt={`${team.name} team photo`}
                          fill
                          className="object-contain bg-gray-100"
                          sizes="(max-width: 768px) 100vw, 33vw"
                          fallback={<div className="absolute inset-0 bg-gray-100" aria-hidden="true" />}
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
              );
            })}
          </div>
        </div>
      </section>

      {/* Join CTA */}
      <section className="section-padding bg-gradient-to-br from-maroon-700 to-maroon-900 text-white">
        <div className="container-width text-center">
          <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">
            Join a Team
          </h2>
          <p className="text-maroon-100 font-body text-lg max-w-2xl mx-auto mb-8">
            Whether you are an experienced cricketer or a complete beginner, there is a team for you
            at the {CLUB_NICKNAME}. We welcome players of all ages and abilities across our men&apos;s,
            women&apos;s, and junior squads.
          </p>
          <Link href="/contact" className="btn-accent text-lg px-8 py-4">
            Get in Touch
          </Link>
        </div>
      </section>
    </>
  );
}
