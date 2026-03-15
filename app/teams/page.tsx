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

    </>
  );
}
