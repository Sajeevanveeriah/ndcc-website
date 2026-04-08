import type { Metadata } from 'next';
import Image from 'next/image';
import Card, { CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import {
  CLUB_NICKNAME,
  CLUB_ESTABLISHED,
  CLUB_GROUND,
  CLUB_ASSOCIATION,
  CLUB_ASSOCIATION_SHORT,
  COMMITTEE,
  ACKNOWLEDGEMENT,
} from '@/lib/constants';
import { getInitials } from '@/lib/utils';
import { getContentBlocks } from '@/lib/content-blocks';
import { getCommitteeMembers, getHistoryCompetitions, getHistoryLineage, getHistoryPremierships } from '@/lib/structured-content';

export const metadata: Metadata = {
  title: 'About',
};

const premiershipTeams = ['1st XI', '2nd XI', '3rd XI', '4th XI', '5th XI'];

export default async function AboutPage() {
  const [blocks, lineageEntries, premierships, competitions, committeeMembers] = await Promise.all([
    getContentBlocks(['about.hero', 'about.history', 'about.affiliation', 'about.goodsports', 'about.partnership', 'about.committee']),
    getHistoryLineage(),
    getHistoryPremierships(),
    getHistoryCompetitions(),
    getCommitteeMembers(),
  ]);

  const historyTitle = blocks['about.history']?.title || 'Our History';
  const historyBody = blocks['about.history']?.body;
  const historyImage = blocks['about.history']?.image_url || '/images/Turf_Ground.jpg';

  const competitionsByAbbr = Object.fromEntries(competitions.map((item) => [item.abbreviation, item.name]));
  const activeCommittee = committeeMembers.length > 0
    ? committeeMembers.map((member) => ({ name: member.name, role: member.role }))
    : COMMITTEE;

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">{blocks['about.hero']?.title || `About the ${CLUB_NICKNAME}`}</h1>
          <p className="page-hero-subtitle">
            {blocks['about.hero']?.body || `A proud community cricket club in Geelong, established in ${CLUB_ESTABLISHED}.`}
          </p>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="section-title">{historyTitle}</h2>
              <div className="space-y-4 text-gray-700 font-body leading-relaxed whitespace-pre-line">
                <p>{historyBody || 'History content can be managed from the admin panel.'}</p>
              </div>
            </div>
            <div className="relative h-72 lg:h-96 rounded-xl overflow-hidden">
              <Image
                src={historyImage}
                alt="Grinter Reserve, home ground of the Newcomb and District Cricket Club"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="section-padding bg-sky-50">
        <div className="container-width">
          <h2 className="section-title">Club Lineage</h2>
          <p className="section-subtitle mb-6">Historical competition progression and club naming periods.</p>
          <div className="space-y-3">
            {lineageEntries.map((entry) => (
              <Card key={entry.id}>
                <CardContent className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <h3 className="font-display font-bold text-gray-900">{entry.club_name}</h3>
                    <p className="text-sm text-gray-600">{entry.start_season} to {entry.end_season}</p>
                  </div>
                  <Badge variant="default">{entry.association_abbr}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          <h2 className="section-title">Premiership Honours</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {premiershipTeams.map((teamLabel) => {
              const teamPremierships = premierships.filter((item) => item.team_label === teamLabel);
              return (
                <Card key={teamLabel}>
                  <CardContent className="p-6 space-y-3">
                    <h3 className="text-xl font-display font-bold text-maroon-800">{teamLabel}</h3>
                    {teamPremierships.length === 0 ? (
                      <p className="text-sm text-gray-500">No premierships recorded.</p>
                    ) : (
                      <ul className="space-y-2 text-sm text-gray-700">
                        {teamPremierships.map((item) => (
                          <li key={item.id} className="border-b border-gray-100 pb-2 last:border-b-0 last:pb-0">
                            <span className="font-semibold">{item.season_label}</span> · {competitionsByAbbr[item.competition_abbr] || item.competition_abbr} · {item.grade_label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section-padding bg-sky-50">
        <div className="container-width">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="section-title">{blocks['about.affiliation']?.title || `${CLUB_ASSOCIATION_SHORT} Affiliation`}</h2>
              <p className="space-y-4 text-gray-700 font-body leading-relaxed whitespace-pre-line">
                {blocks['about.affiliation']?.body || `${CLUB_NICKNAME} is a proud member of ${CLUB_ASSOCIATION}.`}
              </p>
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

      <section className="section-padding">
        <div className="container-width">
          <div className="max-w-3xl">
            <h2 className="section-title">{blocks['about.goodsports']?.title || 'Good Sports Level 3'}</h2>
            <p className="space-y-4 text-gray-700 font-body leading-relaxed whitespace-pre-line">
              {blocks['about.goodsports']?.body || ''}
            </p>
            <Badge variant="success" className="mt-4 text-sm px-4 py-1">
              {blocks['about.goodsports']?.cta_label || 'Good Sports Level 3 Accredited'}
            </Badge>
          </div>
        </div>
      </section>

      <section className="section-padding bg-sky-50">
        <div className="container-width">
          <div className="max-w-3xl">
            <h2 className="section-title">{blocks['about.partnership']?.title || 'Newcomb Power Football Club'}</h2>
            <p className="space-y-4 text-gray-700 font-body leading-relaxed whitespace-pre-line">
              {blocks['about.partnership']?.body || `NDCC shares facilities at ${CLUB_GROUND}.`}
            </p>
          </div>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          <div className="text-center mb-12">
            <h2 className="section-title">{blocks['about.committee']?.title || 'Committee & Office Bearers'}</h2>
            <p className="section-subtitle mx-auto">
              {blocks['about.committee']?.body || `The people who keep the ${CLUB_NICKNAME} running behind the scenes.`}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {activeCommittee.map((member) => (
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

      <section className="bg-maroon-800 text-white section-padding">
        <div className="container-width max-w-3xl text-center">
          <h2 className="text-2xl font-display font-bold mb-4">Acknowledgement of Country</h2>
          <p className="text-maroon-100 font-body leading-relaxed">{ACKNOWLEDGEMENT}</p>
        </div>
      </section>
    </>
  );
}
