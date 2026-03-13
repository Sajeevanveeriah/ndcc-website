import type { Metadata } from 'next';
import Card, { CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import {
  CLUB_NAME,
  CLUB_NICKNAME,
  CLUB_ESTABLISHED,
  CLUB_GROUND,
  CLUB_ADDRESS,
  CLUB_ASSOCIATION,
  CLUB_ASSOCIATION_SHORT,
  COMMITTEE,
  ACKNOWLEDGEMENT,
} from '@/lib/constants';
import { getInitials } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'About',
};

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">About the {CLUB_NICKNAME}</h1>
          <p className="page-hero-subtitle">
            A proud community cricket club in Geelong, established in {CLUB_ESTABLISHED}.
          </p>
        </div>
      </section>

      {/* Club History */}
      <section className="section-padding">
        <div className="container-width">
          <div className="max-w-3xl">
            <h2 className="section-title">Our History</h2>
            <div className="space-y-4 text-gray-700 font-body leading-relaxed">
              <p>
                The {CLUB_NAME} was founded in {CLUB_ESTABLISHED} in the suburb of Newcomb,
                located in the greater Geelong region of Victoria. For over five decades, the club
                has been a cornerstone of local cricket, bringing together players and families
                from across the community.
              </p>
              <p>
                From humble beginnings, the {CLUB_NICKNAME} have grown into a multi-team club
                fielding sides across senior men&apos;s, senior women&apos;s, and junior
                competitions. Our home ground at {CLUB_GROUND}, {CLUB_ADDRESS}, has been the
                heart of the club for generations.
              </p>
              <p>
                The club prides itself on its inclusive, family-friendly culture. Whether
                you&apos;re an experienced cricketer or new to the game, the {CLUB_NICKNAME}{' '}
                welcome everyone.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* GCA Affiliation */}
      <section className="section-padding bg-gray-50">
        <div className="container-width">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="section-title">{CLUB_ASSOCIATION_SHORT} Affiliation</h2>
              <div className="space-y-4 text-gray-700 font-body leading-relaxed">
                <p>
                  NDCC is a proud member of the {CLUB_ASSOCIATION} ({CLUB_ASSOCIATION_SHORT}),
                  one of the premier cricket associations in regional Victoria. The{' '}
                  {CLUB_ASSOCIATION_SHORT} oversees competitions across a wide range of grades,
                  providing pathways for players of all abilities.
                </p>
                <p>
                  Our Senior Men compete in {CLUB_ASSOCIATION_SHORT} Grade 4, while our Senior
                  Women play in {CLUB_ASSOCIATION_SHORT} E Grade East. Junior players participate
                  in the {CLUB_ASSOCIATION_SHORT} junior competition throughout the season.
                </p>
              </div>
            </div>
            <Card>
              <CardContent className="p-8 text-center">
                <div className="w-20 h-20 bg-maroon-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-maroon-700 font-display font-bold text-2xl">{CLUB_ASSOCIATION_SHORT}</span>
                </div>
                <h3 className="text-xl font-display font-bold text-gray-900 mb-2">{CLUB_ASSOCIATION}</h3>
                <p className="text-gray-600 font-body text-sm">Affiliated since {CLUB_ESTABLISHED}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Good Sports */}
      <section className="section-padding">
        <div className="container-width">
          <div className="max-w-3xl">
            <h2 className="section-title">Good Sports Level 3</h2>
            <div className="space-y-4 text-gray-700 font-body leading-relaxed">
              <p>
                NDCC is a proud Level 3 accredited Good Sports club. Good Sports is Australia&apos;s
                largest health initiative in community sport, helping clubs create a safer and
                healthier environment for members, families, and the wider community.
              </p>
              <p>
                As a Level 3 club, we demonstrate our commitment to responsible alcohol management,
                promoting healthy lifestyles, and ensuring our club is a welcoming place for
                everyone — especially young players and families.
              </p>
            </div>
            <Badge variant="success" className="mt-4 text-sm px-4 py-1">
              Good Sports Level 3 Accredited
            </Badge>
          </div>
        </div>
      </section>

      {/* Partnership with NPFC */}
      <section className="section-padding bg-gray-50">
        <div className="container-width">
          <div className="max-w-3xl">
            <h2 className="section-title">Newcomb Power Football Club</h2>
            <div className="space-y-4 text-gray-700 font-body leading-relaxed">
              <p>
                NDCC shares a strong partnership with the Newcomb Power Football Club. Together, we
                share facilities at {CLUB_GROUND} and work collaboratively to support sport in the
                Newcomb and Moolap community.
              </p>
              <p>
                This partnership allows us to provide better facilities, coordinate social events, and
                strengthen the community bond between our two clubs. Many of our members play for
                both clubs across the winter and summer seasons.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Committee / Office Bearers */}
      <section className="section-padding">
        <div className="container-width">
          <div className="text-center mb-12">
            <h2 className="section-title">Committee &amp; Office Bearers</h2>
            <p className="section-subtitle mx-auto">
              The people who keep the {CLUB_NICKNAME} running behind the scenes.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {COMMITTEE.map((member) => (
              <Card key={member.name}>
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 bg-maroon-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-maroon-700 font-display font-bold text-lg">
                      {getInitials(member.name)}
                    </span>
                  </div>
                  <h3 className="text-lg font-display font-bold text-gray-900">{member.name}</h3>
                  <p className="text-maroon-600 font-body text-sm font-semibold">{member.role}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Acknowledgement of Country */}
      <section className="bg-maroon-800 text-white section-padding">
        <div className="container-width max-w-3xl text-center">
          <h2 className="text-2xl font-display font-bold mb-4">Acknowledgement of Country</h2>
          <p className="text-maroon-100 font-body leading-relaxed">{ACKNOWLEDGEMENT}</p>
        </div>
      </section>
    </>
  );
}
