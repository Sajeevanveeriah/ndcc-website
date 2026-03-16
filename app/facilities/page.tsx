import type { Metadata } from 'next';
import Card, { CardContent } from '@/components/ui/Card';
import { CLUB_GROUND, CLUB_ADDRESS, CLUB_NICKNAME } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Facilities',
};

const features = [
  {
    title: '3 Public Synthetic Lanes',
    description: 'Open to the community for practice all year round.',
    icon: (
      <svg className="w-8 h-8 text-maroon-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
      </svg>
    ),
  },
  {
    title: '4 Club Turf Lanes',
    description: 'High-quality turf practice wickets for club training sessions.',
    icon: (
      <svg className="w-8 h-8 text-maroon-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
      </svg>
    ),
  },
  {
    title: 'Clubrooms & Pavilion',
    description: 'Social facilities, change rooms, and a fully equipped canteen on match days.',
    icon: (
      <svg className="w-8 h-8 text-maroon-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    title: 'Oval & Outfield',
    description: 'Well-maintained turf wicket square and outfield at Grinter Reserve.',
    icon: (
      <svg className="w-8 h-8 text-maroon-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
      </svg>
    ),
  },
  {
    title: 'Parking',
    description: 'Ample on-site parking for players, officials, and spectators.',
    icon: (
      <svg className="w-8 h-8 text-maroon-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
  },
  {
    title: 'Accessible',
    description: 'Accessible facilities for players and spectators of all abilities.',
    icon: (
      <svg className="w-8 h-8 text-maroon-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
];

export default function FacilitiesPage() {
  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">Our Facilities</h1>
          <p className="page-hero-subtitle">
            Home ground, training nets, and community facilities at {CLUB_GROUND}.
          </p>
        </div>
      </section>

      {/* Grinter Reserve */}
      <section className="section-padding">
        <div className="container-width max-w-4xl mx-auto">
          <h2 className="section-title">{CLUB_GROUND}</h2>
          <p className="text-gray-500 font-body text-sm mb-6">{CLUB_ADDRESS}</p>
          <div className="space-y-4 text-gray-700 font-body leading-relaxed">
            <p>
              {CLUB_GROUND} is the proud home of the {CLUB_NICKNAME}. Located in Moolap, just
              south of Geelong, the ground has been a hub for community cricket for decades.
            </p>
            <p>
              The venue features a quality turf wicket square, well-maintained outfield, modern
              clubrooms and pavilion, and ample facilities for players, officials, and spectators
              alike.
            </p>
            <p>
              Shared with the Newcomb Power Football Club, {CLUB_GROUND} is a true multi-sport
              community facility serving the Newcomb and Moolap areas.
            </p>
          </div>
        </div>
      </section>

      {/* Training Facility */}
      <section className="section-padding bg-gray-50">
        <div className="container-width max-w-4xl mx-auto">
          <h2 className="section-title">Peter &lsquo;Skinny&rsquo; Harrison Training Facility</h2>
          <p className="text-maroon-600 font-body text-sm font-semibold mb-6">
            Opened August 2024
          </p>
          <div className="space-y-4 text-gray-700 font-body leading-relaxed">
            <p>
              The Peter &lsquo;Skinny&rsquo; Harrison Training Facility is a state-of-the-art
              training venue named in honour of a beloved club legend. Officially opened in
              August 2024, the facility represents a major investment in the future of cricket
              at NDCC.
            </p>
            <p>
              The facility features <strong>3 public synthetic lanes</strong> available for
              community use, as well as <strong>4 club turf lanes</strong> reserved for
              official NDCC training sessions.
            </p>
            <p>
              These world-class nets provide our players with exceptional training surfaces and
              give the broader community access to quality cricket practice facilities.
            </p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="section-padding">
        <div className="container-width">
          <div className="text-center mb-12">
            <h2 className="section-title">Facility Features</h2>
            <p className="section-subtitle mx-auto">
              Everything our ground has to offer for players and visitors.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title}>
                <CardContent className="p-6">
                  <div className="w-14 h-14 bg-maroon-50 rounded-lg flex items-center justify-center mb-4">
                    {feature.icon}
                  </div>
                  <h3 className="text-lg font-display font-bold text-gray-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 font-body text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
