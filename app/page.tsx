export const revalidate = 300;

import { Suspense } from 'react';
import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import Image from 'next/image';
import SafeImage from '@/components/common/SafeImage';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import Card, { CardContent } from '@/components/ui/Card';
import {
  CLUB_NAME,
  CLUB_NICKNAME,
  CLUB_ESTABLISHED,
  PLAYHQ_ORG_URL,
  FACEBOOK_URL,
} from '@/lib/constants';
import { formatDate, truncateText } from '@/lib/utils';
import { getContentBlocks } from '@/lib/content-blocks';
import { getPublishedNews, type PublicNewsRecord } from '@/lib/public-news';
import { getPublicSeasonAppointments, type PublicSeasonAppointment } from '@/lib/public-season-appointments';
import { createServerClient } from '@/lib/supabase-server';
import { getPageLinkCards } from '@/lib/structured-content';
import { normalizeSeasonAppointmentImage } from '@/lib/public-content-normalizers';
import { fallbackNews, fallbackSponsors, isProductionStaticBuild, mergeSponsorsWithFallback } from '@/lib/fallback-content';

type NewsItem = PublicNewsRecord & {
  image?: string;
};

interface SponsorItem {
  id: string;
  name: string;
  tier: string;
  website: string;
  logo_url: string;
}

async function getLatestNews(): Promise<NewsItem[]> {
  if (isProductionStaticBuild || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fallbackNews.slice(0, 3) as NewsItem[];
  }

  try {
    const data = await getPublishedNews({ limit: 3 });
    if (!Array.isArray(data)) return [];
    return data as NewsItem[];
  } catch {
    return fallbackNews.slice(0, 3) as NewsItem[];
  }
}

const getSponsors = unstable_cache(async (): Promise<SponsorItem[]> => {
  if (isProductionStaticBuild || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fallbackSponsors as SponsorItem[];
  }
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('sponsors')
      .select('id, name, tier, website, logo_url')
      .eq('active', true)
      .order('created_at', { ascending: true });
    return mergeSponsorsWithFallback(data as SponsorItem[]) as SponsorItem[];
  } catch {
    return fallbackSponsors as SponsorItem[];
  }
}, ['home-sponsors'], { revalidate: 300, tags: ['sponsors'] });

const HERO_DEFAULT_BODY = `Home of the ${CLUB_NICKNAME}. Est. ${CLUB_ESTABLISHED}.`;

function HeroView({
  title,
  body,
  ctaLabel,
  ctaUrl,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}) {
  return (
    <section className="relative text-white overflow-hidden" style={{ minHeight: '520px', display: 'flex', flexDirection: 'column' }}>
      <Image
        src="/images/Turf_Ground.jpg"
        alt="Grinter Reserve at dusk, home of the Newcomb and District Cricket Club"
        fill
        className="object-cover animate-ken-burns"
        priority
      />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(45,0,0,0.88) 0%, rgba(45,0,0,0.58) 55%, rgba(45,0,0,0.32) 100%)' }} />
      <div className="container-width relative z-10 flex-1 flex items-center section-padding">
        <div className="w-full">
          <ScrollReveal onMount delay={0}>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold mb-4">
              {title}
            </h1>
          </ScrollReveal>
          <ScrollReveal onMount delay={0.15}>
            <p className="text-xl sm:text-2xl text-maroon-100 font-body mb-8 max-w-2xl">
              {body}
            </p>
          </ScrollReveal>
          <ScrollReveal onMount delay={0.3}>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href={ctaUrl} className="btn-primary text-lg px-8 py-4">
                {ctaLabel}
              </Link>
              <Link href="/fixtures" className="btn-outline-white text-lg px-8 py-4">
                View Fixtures
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

async function HeroSection() {
  const blocks = await getContentBlocks(['home.hero']);
  return (
    <HeroView
      title={blocks['home.hero']?.title || CLUB_NAME}
      body={blocks['home.hero']?.body || HERO_DEFAULT_BODY}
      ctaLabel={blocks['home.hero']?.cta_label || 'Join the Club'}
      ctaUrl={blocks['home.hero']?.cta_url || '/contact'}
    />
  );
}

function QuickLinksSkeleton() {
  return (
    <section className="section-padding surface-sky">
      <div className="container-width">
        <div className="text-center mb-12">
          <span className="section-eyebrow">Quick Links</span>
          <div className="mx-auto h-9 w-64 max-w-full rounded bg-gray-200 animate-pulse mb-3" />
          <div className="mx-auto h-5 w-80 max-w-full rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-full bg-white border border-gray-200 border-l-4 border-l-maroon-700 rounded-xl p-6">
              <div className="h-8 w-8 rounded bg-gray-200 animate-pulse mb-3" />
              <div className="h-6 w-2/3 rounded bg-gray-200 animate-pulse mb-3" />
              <div className="h-4 w-full rounded bg-gray-200 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

async function QuickLinksSection() {
  const [blocks, quickLinks] = await Promise.all([
    getContentBlocks(['home.quicklinks']),
    getPageLinkCards('home', 'quick_links'),
  ]);

  return (
    <section className="section-padding surface-sky">
      <div className="container-width">
        <ScrollReveal className="text-center mb-12">
          <span className="section-eyebrow">Quick Links</span>
          <h2 className="section-title">{blocks['home.quicklinks']?.title || 'Explore the Club'}</h2>
          <p className="section-subtitle mx-auto">
            {blocks['home.quicklinks']?.body || `Everything you need to know about the ${CLUB_NICKNAME}.`}
          </p>
        </ScrollReveal>
        <ScrollReveal stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {quickLinks.map((link) => (
            <ScrollRevealItem key={link.id}>
            <Link
              href={link.href}
              className="group h-full bg-white border border-gray-200 border-l-4 border-l-maroon-700 rounded-xl p-6 flex flex-col hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            >
              {link.icon && <span className="text-3xl mb-3 block" aria-hidden="true">{link.icon}</span>}
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-xl font-display font-bold text-maroon-800 mb-2 group-hover:text-maroon-700 transition-colors">
                  {link.title}
                </h3>
                <span className="text-gray-300 text-xl group-hover:text-maroon-500 group-hover:translate-x-1 transition-all duration-200 shrink-0">→</span>
              </div>
              <p className="text-gray-600 font-body text-sm">{link.description}</p>
            </Link>
            </ScrollRevealItem>
          ))}
        </ScrollReveal>
      </div>
    </section>
  );
}

function SeasonStatusView({
  title,
  body,
  ctaLabel,
  ctaUrl,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}) {
  return (
    <section className="section-padding surface-sky">
      <div className="container-width">
        <ScrollReveal>
        <div
          className="relative overflow-hidden rounded-2xl p-8 sm:p-10 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-8 items-center shadow-lg"
          style={{ background: 'linear-gradient(135deg, #2d0000 0%, #800000 100%)' }}
        >
          <div>
            <h2 className="section-title" style={{ color: '#ffffff' }}>Season Update</h2>
            <h3 className="text-xl font-display font-bold mb-3" style={{ color: '#ffffff' }}>{title}</h3>
            <p className="font-body leading-relaxed mb-0" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {body}{' '}
              <Link href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="text-sky_accent hover:underline font-semibold">
                Facebook page
              </Link>.
            </p>
          </div>
          <Link
            href={ctaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-accent inline-flex items-center whitespace-nowrap"
          >
            {ctaLabel}
            <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </Link>
        </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

const SEASON_STATUS_DEFAULT_BODY = `Follow the latest ${CLUB_NICKNAME} season updates, match-day notices, and club announcements on our official channels.`;

async function SeasonStatusSection() {
  const blocks = await getContentBlocks(['home.season_status']);
  return (
    <SeasonStatusView
      title={blocks['home.season_status']?.title || 'Season Update'}
      body={blocks['home.season_status']?.body || SEASON_STATUS_DEFAULT_BODY}
      ctaLabel={blocks['home.season_status']?.cta_label || 'View Results on PlayHQ'}
      ctaUrl={blocks['home.season_status']?.cta_url || PLAYHQ_ORG_URL}
    />
  );
}

function NewsSkeleton() {
  return (
    <section className="section-padding surface-sky">
      <div className="container-width">
        <div className="text-center mb-12">
          <span className="section-eyebrow">Club News</span>
          <div className="mx-auto h-9 w-56 max-w-full rounded bg-gray-200 animate-pulse mb-3" />
          <div className="mx-auto h-5 w-80 max-w-full rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[0, 1, 2].map((index) => (
            <Card key={index} className="h-full overflow-hidden">
              <div className="aspect-[4/3] w-full bg-gray-200 animate-pulse" />
              <CardContent className="p-6">
                <div className="h-4 w-28 rounded bg-gray-200 animate-pulse mb-3" />
                <div className="h-6 w-3/4 rounded bg-gray-200 animate-pulse mb-3" />
                <div className="h-4 w-full rounded bg-gray-200 animate-pulse mb-2" />
                <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link href="/news" className="btn-secondary">
            Read More News
          </Link>
        </div>
      </div>
    </section>
  );
}

async function NewsSection() {
  const [blocks, news] = await Promise.all([
    getContentBlocks(['home.welcome']),
    getLatestNews(),
  ]);

  return (
    <section className="section-padding surface-sky">
      <div className="container-width">
        <ScrollReveal className="text-center mb-12">
          <span className="section-eyebrow">Club News</span>
          <h2 className="section-title">{blocks['home.welcome']?.title || 'Latest News'}</h2>
          <p className="section-subtitle mx-auto">
            {blocks['home.welcome']?.body || 'Stay up to date with everything happening at NDCC.'}
          </p>
        </ScrollReveal>
        <ScrollReveal stagger className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {news.map((article) => {
            const inner = (
              <Card hover className="h-full overflow-hidden">
                {(article.image_url || article.image) ? (
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-50">
                    <SafeImage
                      src={article.image_url || article.image || '/images/Womens_Team.jpg'}
                      alt={article.title}
                      fill
                      className="object-contain group-hover:scale-105 transition-transform duration-500"
                      sizes="(max-width: 768px) 100vw, 33vw"
                      fallback={
                        <div className="h-full w-full flex items-center justify-center bg-maroon-800">
                          <span className="text-white/30 font-display font-black text-4xl">NDCC</span>
                        </div>
                      }
                    />
                  </div>
                ) : (
                  <div className="relative aspect-[4/3] w-full overflow-hidden">
                    <Image
                      src="/images/Womens_Team.jpg"
                      alt="Newcomb and District Cricket Club"
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  </div>
                )}
                <CardContent className="p-6">
                  {article.published_at && (
                    <p className="text-sm text-maroon-600 font-body font-semibold mb-2">
                      {formatDate(article.published_at)}
                    </p>
                  )}
                  <h3 className="text-lg font-display font-bold text-gray-900 mb-2 group-hover:text-maroon-700 transition-colors">
                    {article.title}
                  </h3>
                  <p className="text-gray-600 font-body text-sm">
                    {truncateText(article.content, 120)}
                  </p>
                </CardContent>
              </Card>
            );

            return (
              <ScrollRevealItem key={article.id}>
                <Link href={`/news/${article.id}`} className="group block h-full">
                  {inner}
                </Link>
              </ScrollRevealItem>
            );
          })}
        </ScrollReveal>
        <div className="text-center mt-8">
          <Link href="/news" className="btn-secondary">
            Read More News
          </Link>
        </div>
      </div>
    </section>
  );
}

function SeasonAppointmentsSkeleton() {
  return (
    <section className="section-padding surface-sky">
      <div className="container-width">
        <div className="text-center mb-12">
          <span className="section-eyebrow">2026/27 Season</span>
          <h2 className="section-title">2026/27 Season Appointments</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="rounded-2xl bg-gray-200 animate-pulse"
              style={{ aspectRatio: '3/4' }}
            />
          ))}
        </div>
        <p className="text-center text-gray-500 font-body text-sm mt-8">
          More appointments to be announced. Follow us on{' '}
          <Link href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="text-maroon-700 hover:underline font-semibold">
            Facebook
          </Link>{' '}
          for updates.
        </p>
      </div>
    </section>
  );
}

async function SeasonAppointmentsSection() {
  const dbSeasonAppointments = await getPublicSeasonAppointments();
  const seasonAppointments = dbSeasonAppointments.map((item: PublicSeasonAppointment) => ({
    ...item,
    image_url: normalizeSeasonAppointmentImage(item.name, item.image_url),
  }));

  return (
    <section className="section-padding surface-sky">
      <div className="container-width">
        <ScrollReveal className="text-center mb-12">
          <span className="section-eyebrow">2026/27 Season</span>
          <h2 className="section-title">2026/27 Season Appointments</h2>
        </ScrollReveal>
        <ScrollReveal className="relative overflow-hidden" role="region" aria-label="2026/27 season appointments carousel">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-sky-50 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-sky-50 to-transparent" />
          <div className="homepage-marquee-track gap-5 py-2">
            {[false, true].map((isDuplicateSequence) => (
              <div
                key={isDuplicateSequence ? 'duplicate' : 'primary'}
                className="contents"
                aria-hidden={isDuplicateSequence || undefined}
              >
                {seasonAppointments.map((appointment) => {
                  const role = appointment.role.trim();
                  const imageAlt = role
                    ? `${appointment.name} appointed as ${role}`
                    : `${appointment.name} season appointment announcement`;

                  return (
                    <div
                      key={`${appointment.id}-${isDuplicateSequence ? 'duplicate' : 'primary'}`}
                      className="group relative h-[360px] w-[270px] flex-none rounded-2xl overflow-hidden bg-maroon-900 shadow-md hover:shadow-xl transition-shadow duration-300"
                    >
                      {appointment.image_url ? (
                        <SafeImage
                          src={appointment.image_url}
                          alt={imageAlt}
                          fill
                          className="object-cover img-zoom"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          fallback={
                            <div className="h-full flex items-center justify-center">
                              <span className="text-white/25 font-display font-black text-6xl">
                                {appointment.name.split(' ').map((w) => w[0]).join('')}
                              </span>
                            </div>
                          }
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center">
                          <span className="text-white/25 font-display font-black text-6xl">
                            {appointment.name.split(' ').map((w) => w[0]).join('')}
                          </span>
                        </div>
                      )}
                      <div
                        className="absolute inset-0"
                        style={{ background: 'linear-gradient(to top, rgba(45,0,0,0.92) 0%, rgba(45,0,0,0.18) 55%, transparent 100%)' }}
                      />
                      <div className="absolute bottom-0 left-0 right-0 p-4 group-hover:-translate-y-1 transition-transform duration-300">
                        <p className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-sky_accent mb-1">
                          {appointment.role}
                        </p>
                        <p className="font-display font-bold text-white text-xl uppercase leading-tight">
                          {appointment.name}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </ScrollReveal>
        <p className="text-center text-gray-500 font-body text-sm mt-8">
          More appointments to be announced. Follow us on{' '}
          <Link href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="text-maroon-700 hover:underline font-semibold">
            Facebook
          </Link>{' '}
          for updates.
        </p>
      </div>
    </section>
  );
}

function SponsorsSkeleton() {
  return (
    <section className="section-padding surface-sky">
      <div className="container-width">
        <div className="text-center mb-10">
          <span className="section-eyebrow">Community Partners</span>
          <div className="mx-auto h-9 w-56 max-w-full rounded bg-gray-200 animate-pulse mb-3" />
          <div className="mx-auto h-5 w-80 max-w-full rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[0, 1, 2].map((index) => (
            <Card key={index} className="h-full border border-sky-100">
              <CardContent className="p-6 flex flex-col items-center text-center h-full">
                <div className="w-full h-28 rounded-lg bg-gray-200 animate-pulse mb-4" />
                <div className="h-5 w-40 rounded bg-gray-200 animate-pulse mb-3" />
                <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link href="/sponsors" className="btn-secondary">
            View All Sponsors
          </Link>
        </div>
      </div>
    </section>
  );
}

async function SponsorsSection() {
  const [blocks, dbSponsors] = await Promise.all([
    getContentBlocks(['home.sponsor_intro', 'home.sponsorship']),
    getSponsors(),
  ]);

  const sponsors = mergeSponsorsWithFallback(dbSponsors).filter((sponsor) => sponsor.logo_url.trim());

  const sponsorBlock = blocks['home.sponsor_intro'] || blocks['home.sponsorship'];
  const sponsorshipTitle = sponsorBlock?.title || 'Our Sponsors';
  const sponsorshipBody = sponsorBlock?.body || 'Thanks to all local businesses and partners supporting NDCC.';

  return (
    <section className="section-padding surface-sky">
      <div className="container-width">
        <ScrollReveal className="text-center mb-10">
          <span className="section-eyebrow">Community Partners</span>
          <h2 className="section-title">{sponsorshipTitle}</h2>
          <p className="section-subtitle mx-auto">
            {sponsorshipBody}
          </p>
        </ScrollReveal>
        <ScrollReveal className="relative overflow-hidden" role="region" aria-label="Club sponsor logos carousel">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-sky-50 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-sky-50 to-transparent" />
          <div className="homepage-marquee-track gap-4 py-2">
            {[...sponsors, ...sponsors].map((sponsor, index) => {
              const logo = (
                <div className="flex h-32 w-56 flex-none items-center justify-center rounded-2xl border border-sky-100 bg-white p-5 shadow-sm transition-shadow duration-300 hover:shadow-md">
                  {sponsor.logo_url ? (
                    <SafeImage
                      src={sponsor.logo_url}
                      alt={`${sponsor.name} logo`}
                      width={190}
                      height={82}
                      className="max-h-20 w-auto object-contain"
                      sizes="190px"
                      fallback={null}
                    />
                  ) : null}
                </div>
              );

              if (!sponsor.website) {
                return <div key={`${sponsor.id}-${index}`} aria-label={sponsor.name}>{logo}</div>;
              }

              return (
                <a
                  key={`${sponsor.id}-${index}`}
                  href={sponsor.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Visit ${sponsor.name} website`}
                  className="block flex-none"
                >
                  {logo}
                </a>
              );
            })}
          </div>
        </ScrollReveal>
        <div className="text-center mt-8">
          <Link href="/sponsors" className="btn-secondary">
            View All Sponsors
          </Link>
        </div>
      </div>
    </section>
  );
}

function JuniorsCtaView({ title, body }: { title: string; body: string }) {
  return (
    <section className="bg-maroon-950 text-white section-padding">
      <ScrollReveal className="container-width text-center">
        <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">
          {title}
        </h2>
        <p className="text-lg text-maroon-100 font-body mb-8 max-w-xl mx-auto">
          {body}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/contact" className="btn-accent text-lg px-8 py-4">
            Get in Touch
          </Link>
          <Link href="/volunteer" className="btn-secondary border-white text-white hover:bg-white hover:text-maroon-800 text-lg px-8 py-4">
            Volunteer With Us
          </Link>
        </div>
      </ScrollReveal>
    </section>
  );
}

const JUNIORS_DEFAULT_TITLE = `Ready to join the ${CLUB_NICKNAME}?`;
const JUNIORS_DEFAULT_BODY = 'Whether you’re a seasoned cricketer or picking up a bat for the first time, there is a place for you at NDCC.';

async function JuniorsCtaSection() {
  const blocks = await getContentBlocks(['home.juniors']);
  return (
    <JuniorsCtaView
      title={blocks['home.juniors']?.title || JUNIORS_DEFAULT_TITLE}
      body={blocks['home.juniors']?.body || JUNIORS_DEFAULT_BODY}
    />
  );
}

export default function HomePage() {
  return (
    <>
      <Suspense
        fallback={
          <HeroView
            title={CLUB_NAME}
            body={HERO_DEFAULT_BODY}
            ctaLabel="Join the Club"
            ctaUrl="/contact"
          />
        }
      >
        <HeroSection />
      </Suspense>

      <Suspense fallback={<QuickLinksSkeleton />}>
        <QuickLinksSection />
      </Suspense>

      <Suspense
        fallback={
          <SeasonStatusView
            title="Season Update"
            body={SEASON_STATUS_DEFAULT_BODY}
            ctaLabel="View Results on PlayHQ"
            ctaUrl={PLAYHQ_ORG_URL}
          />
        }
      >
        <SeasonStatusSection />
      </Suspense>

      <Suspense fallback={<NewsSkeleton />}>
        <NewsSection />
      </Suspense>

      <Suspense fallback={<SeasonAppointmentsSkeleton />}>
        <SeasonAppointmentsSection />
      </Suspense>

      <Suspense fallback={<SponsorsSkeleton />}>
        <SponsorsSection />
      </Suspense>

      <Suspense
        fallback={
          <JuniorsCtaView title={JUNIORS_DEFAULT_TITLE} body={JUNIORS_DEFAULT_BODY} />
        }
      >
        <JuniorsCtaSection />
      </Suspense>
    </>
  );
}
