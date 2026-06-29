import type { Metadata } from 'next';
import Image from 'next/image';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import AnimatedCounter from '@/components/common/AnimatedCounter';
import Card, { CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import {
  CLUB_NICKNAME,
  CLUB_ESTABLISHED,
  CLUB_GROUND,
  CLUB_ASSOCIATION,
  CLUB_ASSOCIATION_SHORT,
} from '@/lib/constants';
import { getInitials, normalisePublicText } from '@/lib/utils';
import { getContentBlocks } from '@/lib/content-blocks';
import { getCommitteeMembers, getHistoryCompetitions, getHistoryLineage, getHistoryPremierships, getPageLinkCards } from '@/lib/structured-content';

export const metadata: Metadata = {
  title: 'About',
};

const premiershipTeams = ['1st XI', '2nd XI', '3rd XI', '4th XI', '5th XI'];

export default async function AboutPage() {
  const [blocks, lineageEntries, premierships, competitions, committeeMembers, aboutArticles] = await Promise.all([
    getContentBlocks(['about.hero', 'about.history', 'about.affiliation', 'about.goodsports', 'about.partnership', 'about.committee']),
    getHistoryLineage(),
    getHistoryPremierships(),
    getHistoryCompetitions(),
    getCommitteeMembers(),
    getPageLinkCards('about', 'articles'),
  ]);

  const historyTitle = blocks['about.history']?.title || 'Our History';
  const historyBody = blocks['about.history']?.body;
  const historyImage = blocks['about.history']?.image_url || '/images/Turf_Ground.jpg';

  const currentYear = new Date().getFullYear();
  const yearsStrong = Math.max(currentYear - CLUB_ESTABLISHED, 0);
  const premiershipCount = premierships.length;
  const gcaLineage = lineageEntries.find(
    (entry) => entry.association_abbr === CLUB_ASSOCIATION_SHORT && /present/i.test(entry.end_season)
  );
  const gcaStartYear = Number(gcaLineage?.start_season.slice(0, 4));
  const seasonsInGca = Math.max(currentYear - (Number.isFinite(gcaStartYear) ? gcaStartYear : 1995), 0);

  const competitionsByAbbr = Object.fromEntries(competitions.map((item) => [item.abbreviation, item.name]));
  const activeCommittee = committeeMembers.map((member) => ({ name: member.name, role: member.role }));

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <ScrollReveal onMount delay={0}>
            <h1 className="page-hero-title">{blocks['about.hero']?.title || `About the ${CLUB_NICKNAME}`}</h1>
          </ScrollReveal>
          <ScrollReveal onMount delay={0.15}>
            <p className="page-hero-subtitle">
              {normalisePublicText(blocks['about.hero']?.body) || `A proud community cricket club in Geelong, established in ${CLUB_ESTABLISHED}.`}
            </p>
          </ScrollReveal>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <ScrollReveal direction="left">
              <div>
                <span className="section-eyebrow">Est. <AnimatedCounter to={1972} duration={1.8} /></span>
                <h2 className="section-title">{historyTitle}</h2>
                <div className="space-y-4 text-gray-700 font-body leading-relaxed whitespace-pre-line">
                  <p>{normalisePublicText(historyBody) || `${CLUB_NICKNAME} has proudly represented Newcomb since ${CLUB_ESTABLISHED}, built on generations of community involvement and cricket tradition.`}</p>
                </div>
              </div>
            </ScrollReveal>
            <ScrollReveal direction="right">
              <div className="relative h-72 lg:h-96 rounded-xl overflow-hidden">
                <Image
                  src={historyImage}
                  alt="Grinter Reserve, home ground of the Newcomb and District Cricket Club"
                  fill
                  priority
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      <section className="section-padding bg-maroon-900 text-white">
        <div className="container-width">
          <ScrollReveal stagger className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            <ScrollRevealItem>
              <p className="font-display text-5xl sm:text-6xl font-bold text-amber-300">
                <AnimatedCounter to={yearsStrong} />
              </p>
              <p className="mt-2 font-body text-sm uppercase tracking-wide text-maroon-100">Years Strong</p>
            </ScrollRevealItem>
            <ScrollRevealItem>
              <p className="font-display text-5xl sm:text-6xl font-bold text-amber-300">
                <AnimatedCounter to={premiershipCount} />
              </p>
              <p className="mt-2 font-body text-sm uppercase tracking-wide text-maroon-100">Premierships Won</p>
            </ScrollRevealItem>
            <ScrollRevealItem>
              <p className="font-display text-5xl sm:text-6xl font-bold text-amber-300">
                <AnimatedCounter to={seasonsInGca} />
              </p>
              <p className="mt-2 font-body text-sm uppercase tracking-wide text-maroon-100">Seasons in the {CLUB_ASSOCIATION_SHORT}</p>
            </ScrollRevealItem>
          </ScrollReveal>
        </div>
      </section>

      <div className="container-width px-4">
        <div className="flex items-center justify-center gap-4 py-10" aria-hidden="true">
          <span className="h-px w-20 bg-gradient-to-r from-transparent to-maroon-200" />
          <span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-maroon-600" />
          <span className="h-px w-20 bg-gradient-to-l from-transparent to-maroon-200" />
        </div>
      </div>

      <section className="section-padding surface-sky">
        <div className="container-width">
          <h2 className="section-title">Club Lineage</h2>
          <p className="section-subtitle mb-6">Historical competition progression and club naming periods.</p>
          <ScrollReveal stagger className="space-y-3">
            {lineageEntries.map((entry) => (
              <ScrollRevealItem key={entry.id}>
                <Card>
                  <CardContent className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <h3 className="font-display font-bold text-gray-900">{entry.club_name}</h3>
                      <p className="text-sm text-gray-600">{entry.start_season} to {entry.end_season}</p>
                    </div>
                    <Badge variant="default">{entry.association_abbr}</Badge>
                  </CardContent>
                </Card>
              </ScrollRevealItem>
            ))}
          </ScrollReveal>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          <span className="section-eyebrow">Club History</span>
          <h2 className="section-title">Premiership Honours</h2>
          <ScrollReveal stagger className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {premiershipTeams.map((teamLabel) => {
              const teamPremierships = premierships.filter((item) => item.team_label === teamLabel);
              return (
                <ScrollRevealItem key={teamLabel}>
                <Card>
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
                </ScrollRevealItem>
              );
            })}
          </ScrollReveal>
        </div>
      </section>

      <section className="section-padding surface-sky">
        <div className="container-width">
          <ScrollReveal className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="section-title">{blocks['about.affiliation']?.title || `${CLUB_ASSOCIATION_SHORT} Affiliation`}</h2>
              <p className="space-y-4 text-gray-700 font-body leading-relaxed whitespace-pre-line">
                {normalisePublicText(blocks['about.affiliation']?.body) || `${CLUB_NICKNAME} is a proud member of ${CLUB_ASSOCIATION}.`}
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
          </ScrollReveal>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          <ScrollReveal className="max-w-3xl">
            <span className="section-eyebrow">Accreditation</span>
            <h2 className="section-title">{blocks['about.goodsports']?.title || 'Good Sports Level 3'}</h2>
            <p className="space-y-4 text-gray-700 font-body leading-relaxed whitespace-pre-line">
              {normalisePublicText(blocks['about.goodsports']?.body)}
            </p>
            <Badge variant="success" className="mt-4 text-sm px-4 py-1">
              {normalisePublicText(blocks['about.goodsports']?.cta_label) || 'Good Sports Level 3 Accredited'}
            </Badge>
          </ScrollReveal>
        </div>
      </section>

      <section className="section-padding surface-sky">
        <div className="container-width">
          <div className="max-w-3xl">
            <h2 className="section-title">{normalisePublicText(blocks['about.partnership']?.title) || 'Newcomb Power Football & Netball Club'}</h2>
            <p className="space-y-4 text-gray-700 font-body leading-relaxed whitespace-pre-line">
              {normalisePublicText(blocks['about.partnership']?.body) || `NDCC shares facilities at ${CLUB_GROUND}.`}
            </p>
          </div>
        </div>
      </section>

      {aboutArticles.length > 0 && (
        <section className="section-padding">
          <div className="container-width">
            <h2 className="section-title">About Articles</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              {aboutArticles.map((article) => (
                <Card key={article.id}>
                  <CardContent className="p-6">
                    <h3 className="font-display font-bold text-gray-900 text-xl">{article.title}</h3>
                    <p className="text-gray-600 mt-2 whitespace-pre-line">{normalisePublicText(article.description)}</p>
                    <a href={article.href} className="btn-secondary mt-4 inline-flex">
                      Read More
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section-padding">
        <div className="container-width">
          <div className="text-center mb-12">
            <span className="section-eyebrow">Office Bearers</span>
            <h2 className="section-title">{blocks['about.committee']?.title || 'Committee & Office Bearers'}</h2>
            <p className="section-subtitle mx-auto">
              {blocks['about.committee']?.body || `The people who keep the ${CLUB_NICKNAME} running behind the scenes.`}
            </p>
          </div>
          {activeCommittee.length === 0 ? (
            <Card className="max-w-3xl mx-auto">
              <CardContent className="p-8 text-center">
                <h3 className="text-2xl font-display font-bold text-maroon-800 mb-2">No active committee members published</h3>
                <p className="text-gray-600 font-body">Committee records are loaded directly from Supabase and are not replaced by a hard-coded list when the table is empty.</p>
              </CardContent>
            </Card>
          ) : (
          <ScrollReveal stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto items-stretch">
            {activeCommittee.map((member) => (
              <ScrollRevealItem key={member.name}>
                <Card hover className="group h-full">
                  <CardContent className="p-7 text-center h-full flex flex-col items-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-maroon-700 to-maroon-900 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-md group-hover:scale-105 transition-all duration-300">
                      <span className="text-amber-300 font-display font-bold text-xl">
                        {getInitials(member.name)}
                      </span>
                    </div>
                    <h3 className="text-lg font-display font-bold text-gray-900">{member.name}</h3>
                    <p className="text-maroon-600 font-body text-sm font-semibold">{member.role}</p>
                  </CardContent>
                </Card>
              </ScrollRevealItem>
            ))}
          </ScrollReveal>
          )}
        </div>
      </section>

    </>
  );
}
