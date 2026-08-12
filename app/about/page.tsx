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

// Request-time rendering: committee, history, and content blocks are mutable
// CMS content, so this page must never be served from a build-time prerender.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const premiershipTeams = ['1st XI', '2nd XI', '3rd XI', '4th XI', '5th XI'];

export default async function AboutPage() {
  const [blocks, cmsLineage, cmsPremierships, cmsCompetitions, cmsCommittee, aboutArticles] = await Promise.all([
    getContentBlocks(['about.hero', 'about.history', 'about.affiliation', 'about.goodsports', 'about.partnership', 'about.committee']),
    getHistoryLineage(),
    getHistoryPremierships(),
    getHistoryCompetitions(),
    getCommitteeMembers(),
    getPageLinkCards('about', 'articles'),
  ]);

  // The helpers already reserve static fallback for unconfigured/failed-query
  // paths; a successful (even empty) live result is rendered as-is so seed
  // rows can never masquerade as live CMS content.
  const lineageEntries = cmsLineage;
  const premierships = cmsPremierships;
  const competitions = cmsCompetitions;
  const committeeMembers = cmsCommittee;

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
            <span className="eyebrow-gold">Est. {CLUB_ESTABLISHED} &middot; {CLUB_ASSOCIATION}</span>
            <h1 className="page-hero-title">{blocks['about.hero']?.title || `About the ${CLUB_NICKNAME}`}</h1>
          </ScrollReveal>
          <ScrollReveal onMount delay={0.15}>
            <p className="page-hero-subtitle">
              {normalisePublicText(blocks['about.hero']?.body) || `A proud community cricket club in Geelong, established in ${CLUB_ESTABLISHED}.`}
            </p>
          </ScrollReveal>
        </div>
      </section>

      <nav className="border-b border-edge-subtle bg-surface-card px-4 py-3 sm:px-6 lg:px-8" aria-label="On this page">
        <div className="container-width flex flex-wrap items-center gap-x-5 gap-y-2 font-body text-sm font-semibold">
          <span className="text-content-muted">On this page</span>
          <a href="#club-history" className="text-maroon-700 hover:underline dark:text-maroon-200">History</a>
          <a href="#premiership-honours" className="text-maroon-700 hover:underline dark:text-maroon-200">Honours</a>
          <a href="#club-connections" className="text-maroon-700 hover:underline dark:text-maroon-200">Connections</a>
          <a href="#committee" className="text-maroon-700 hover:underline dark:text-maroon-200">Committee</a>
        </div>
      </nav>

      <section id="club-history" className="section-padding scroll-mt-28">
        <div className="container-width">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
            <ScrollReveal direction="left">
              <div>
                <span className="section-eyebrow">Est. <AnimatedCounter to={1972} duration={1.8} /></span>
                <h2 className="section-title">{historyTitle}</h2>
                <div className="space-y-4 text-content-secondary font-body leading-relaxed whitespace-pre-line">
                  <p>{normalisePublicText(historyBody) || `${CLUB_NICKNAME} has proudly represented Newcomb since ${CLUB_ESTABLISHED}, built on generations of community involvement and cricket tradition.`}</p>
                </div>
              </div>
            </ScrollReveal>
            <ScrollReveal direction="right">
              <div className="relative h-64 overflow-hidden rounded-xl lg:h-80">
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

      <section className="band-maroon section-padding">
        <div className="container-width">
          <ScrollReveal stagger className="grid grid-cols-3 gap-4 text-center">
            <ScrollRevealItem>
              <p className="font-display text-3xl font-bold text-gold-200 sm:text-4xl">
                <AnimatedCounter to={yearsStrong} />
              </p>
              <p className="mt-2 font-body text-sm uppercase tracking-wide text-maroon-100">Years Strong</p>
            </ScrollRevealItem>
            <ScrollRevealItem>
              <p className="font-display text-3xl font-bold text-gold-200 sm:text-4xl">
                <AnimatedCounter to={premiershipCount} />
              </p>
              <p className="mt-2 font-body text-sm uppercase tracking-wide text-maroon-100">Premierships Won</p>
            </ScrollRevealItem>
            <ScrollRevealItem>
              <p className="font-display text-3xl font-bold text-gold-200 sm:text-4xl">
                <AnimatedCounter to={seasonsInGca} />
              </p>
              <p className="mt-2 font-body text-sm uppercase tracking-wide text-maroon-100">Seasons in the {CLUB_ASSOCIATION_SHORT}</p>
            </ScrollRevealItem>
          </ScrollReveal>
        </div>
      </section>

      <section className="section-padding surface-blue-band">
        <div className="container-width">
          <h2 className="section-title">Club Lineage</h2>
          <p className="section-subtitle mb-6">Historical competition progression and club naming periods.</p>
          <ScrollReveal stagger className="space-y-3">
            {lineageEntries.map((entry) => (
              <ScrollRevealItem key={entry.id}>
                <Card>
                  <CardContent className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <h3 className="font-display font-bold text-content-primary">{entry.club_name}</h3>
                      <p className="text-sm text-content-muted">{entry.start_season} to {entry.end_season}</p>
                    </div>
                    <Badge variant="default">{entry.association_abbr}</Badge>
                  </CardContent>
                </Card>
              </ScrollRevealItem>
            ))}
          </ScrollReveal>
        </div>
      </section>

      <section id="premiership-honours" className="section-padding scroll-mt-28">
        <div className="container-width">
          <span className="section-eyebrow">Club History</span>
          <h2 className="section-title">Premiership Honours</h2>
          <ScrollReveal stagger className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {premiershipTeams.map((teamLabel) => {
              const teamPremierships = premierships.filter((item) => item.team_label === teamLabel);
              return (
                <ScrollRevealItem key={teamLabel}>
                {/* The literal honour board: gold-lettered premiership plaques. */}
                <div className="band-maroon h-full space-y-3 rounded-xl p-5 shadow-card">
                  <h3 className="text-xl font-display font-bold uppercase tracking-wide text-gold-200 border-b border-gold-400/25 pb-3">{teamLabel}</h3>
                  {teamPremierships.length === 0 ? (
                    <p className="text-sm text-white/60 font-body">No premierships recorded yet.</p>
                  ) : (
                    <ul className="space-y-2 text-sm text-white/85 font-body">
                      {teamPremierships.map((item) => (
                        <li key={item.id} className="border-b border-white/10 pb-2 last:border-b-0 last:pb-0">
                          <span className="font-semibold text-gold-100">{item.season_label}</span> · {competitionsByAbbr[item.competition_abbr] || item.competition_abbr} · {item.grade_label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                </ScrollRevealItem>
              );
            })}
          </ScrollReveal>
        </div>
      </section>

      <section id="club-connections" className="section-padding surface-blue-band scroll-mt-28">
        <div className="container-width">
          <div className="mb-8 text-center">
            <span className="section-eyebrow">Community &amp; Standards</span>
            <h2 className="section-title">Club Connections</h2>
          </div>
          <ScrollReveal stagger className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ScrollRevealItem>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col p-5">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-maroon-100 dark:bg-maroon-950">
                    <span className="font-display text-base font-bold text-maroon-700 dark:text-maroon-200">{CLUB_ASSOCIATION_SHORT}</span>
                  </div>
                  <h3 className="mb-2 font-display text-xl font-bold text-content-primary">{blocks['about.affiliation']?.title || `${CLUB_ASSOCIATION_SHORT} Affiliation`}</h3>
                  <p className="whitespace-pre-line font-body leading-relaxed text-content-secondary">
                    {normalisePublicText(blocks['about.affiliation']?.body) || `${CLUB_NICKNAME} is a proud member of ${CLUB_ASSOCIATION}.`}
                  </p>
                  <p className="mt-auto pt-4 font-body text-sm text-content-muted">Affiliated since {CLUB_ESTABLISHED}</p>
                </CardContent>
              </Card>
            </ScrollRevealItem>
            <ScrollRevealItem>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col p-5">
                  <span className="section-eyebrow">Accreditation</span>
                  <h3 className="mb-2 font-display text-xl font-bold text-content-primary">{blocks['about.goodsports']?.title || 'Good Sports Level 3'}</h3>
                  <p className="whitespace-pre-line font-body leading-relaxed text-content-secondary">{normalisePublicText(blocks['about.goodsports']?.body)}</p>
                  <Badge variant="success" className="mt-auto self-start text-sm">
                    {normalisePublicText(blocks['about.goodsports']?.cta_label) || 'Good Sports Level 3 Accredited'}
                  </Badge>
                </CardContent>
              </Card>
            </ScrollRevealItem>
            <ScrollRevealItem>
              <Card className="h-full">
                <CardContent className="p-5">
                  <span className="section-eyebrow">Shared Facilities</span>
                  <h3 className="mb-2 font-display text-xl font-bold text-content-primary">{normalisePublicText(blocks['about.partnership']?.title) || 'Newcomb Power Football & Netball Club'}</h3>
                  <p className="whitespace-pre-line font-body leading-relaxed text-content-secondary">
                    {normalisePublicText(blocks['about.partnership']?.body) || `NDCC shares facilities at ${CLUB_GROUND}.`}
                  </p>
                </CardContent>
              </Card>
            </ScrollRevealItem>
          </ScrollReveal>
        </div>
      </section>

      {aboutArticles.length > 0 && (
        <section className="section-padding">
          <div className="container-width">
            <h2 className="section-title">About Articles</h2>
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              {aboutArticles.map((article) => (
                <Card key={article.id}>
                  <CardContent className="p-5">
                    <h3 className="font-display font-bold text-content-primary text-xl">{article.title}</h3>
                    <p className="text-content-muted mt-2 whitespace-pre-line">{normalisePublicText(article.description)}</p>
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

      <section id="committee" className="section-padding scroll-mt-28">
        <div className="container-width">
          <div className="mb-8 text-center">
            <span className="section-eyebrow">Office Bearers</span>
            <h2 className="section-title">{blocks['about.committee']?.title || 'Committee & Office Bearers'}</h2>
            <p className="section-subtitle mx-auto">
              {blocks['about.committee']?.body || `The people who keep the ${CLUB_NICKNAME} running behind the scenes.`}
            </p>
          </div>
          <ScrollReveal stagger className="mx-auto grid max-w-5xl grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeCommittee.map((member) => (
              <ScrollRevealItem key={member.name}>
                <Card hover className="group h-full">
                  <CardContent className="flex h-full flex-col items-center p-5 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-maroon-700 to-maroon-900 shadow-md transition-all duration-300 group-hover:scale-105">
                      <span className="text-gold-200 font-display font-bold text-xl">
                        {getInitials(member.name)}
                      </span>
                    </div>
                    <h3 className="text-lg font-display font-bold text-content-primary">{member.name}</h3>
                    <p className="text-maroon-600 dark:text-maroon-300 font-body text-sm font-semibold">{member.role}</p>
                  </CardContent>
                </Card>
              </ScrollRevealItem>
            ))}
          </ScrollReveal>
        </div>
      </section>

    </>
  );
}
