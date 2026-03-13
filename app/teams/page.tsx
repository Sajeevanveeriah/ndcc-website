import type { Metadata } from 'next';
import Card, { CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { TEAMS, CLUB_NICKNAME } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Teams',
};

export default function TeamsPage() {
  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">Our Teams</h1>
          <p className="page-hero-subtitle">
            Meet the squads representing the {CLUB_NICKNAME} across all grades of the GCA.
          </p>
        </div>
      </section>

      {/* Teams */}
      <section className="section-padding">
        <div className="container-width">
          <div className="space-y-12">
            {TEAMS.map((team, index) => (
              <Card key={team.name} className="overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-3">
                  {/* Team colour block */}
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
                  {/* Team details */}
                  <CardContent className="md:col-span-2 p-8">
                    <div className="flex items-start gap-3 mb-4">
                      <Badge>{team.grade}</Badge>
                    </div>
                    <p className="text-gray-700 font-body leading-relaxed mb-4">
                      {team.description}
                    </p>
                    {team.captain && (
                      <p className="text-sm text-gray-500 font-body">
                        <span className="font-semibold">Captain:</span> {team.captain}
                      </p>
                    )}
                  </CardContent>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Player Profiles Placeholder */}
      <section className="section-padding bg-gray-50">
        <div className="container-width text-center">
          <div className="max-w-lg mx-auto">
            <div className="w-16 h-16 bg-maroon-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-maroon-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.5-1.632Z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-display font-bold text-maroon-800 mb-2">
              Player Profiles Coming Soon
            </h2>
            <p className="text-gray-600 font-body">
              We&apos;re working on individual player profiles for each team. Check back soon to
              learn more about the players who represent the {CLUB_NICKNAME}.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
