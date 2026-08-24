// Request-time rendering: this page is CMS-driven (news, events, gallery,
// sponsors, content blocks), so it must never be served from a build-time
// prerender or the ISR cache where stale seed content can linger.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import SafeImage from '@/components/common/SafeImage';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import HeroParallax from '@/components/common/motion/HeroParallax';
import MaskReveal from '@/components/common/motion/MaskReveal';
import TiltCard from '@/components/common/motion/TiltCard';
import Card, { CardContent } from '@/components/ui/Card';
import type { LucideIcon } from 'lucide-react';
import { Trophy, Users, Calendar, ShoppingCart, Handshake, Mail } from 'lucide-react';
import {
  CLUB_NAME,
  CLUB_NICKNAME,
  CLUB_ESTABLISHED,
  CLUB_ASSOCIATION,
  PLAYHQ_ORG_URL,
  FACEBOOK_URL,
} from '@/lib/constants';
import { formatDate, truncateText } from '@/lib/utils';
import { getContentBlocks } from '@/lib/content-blocks';
import { getPublishedNews, type PublicNewsRecord } from '@/lib/public-news';
import { getPublicSeasonAppointments, type PublicSeasonAppointment } from '@/lib/public-season-appointments';
import SeasonAppointmentsMarquee from '@/components/home/SeasonAppointmentsMarquee';
import HomeStatsStrip from '@/components/home/HomeStatsStrip';
import IntroLogoReveal from '@/components/home/IntroLogoReveal';
import { getPageLinkCards } from '@/lib/structured-content';
import { fallbackNews } from '@/lib/fallback-content';
import PublicationCard from '@/components/publications/PublicationCard';
import SponsorsMarquee from '@/components/home/SponsorsMarquee';
import { getPublishedPublications } from '@/lib/public-publications';
import { getPublicEvents, getPublicGallery, getPublicSponsors } from '@/lib/public-data';
import { getUpcomingCalendarEvents } from '@/lib/calendar/queries';
import { toCalendarFeedEvent } from '@/lib/calendar/format';
import UpcomingEventsStrip from '@/components/calendar/UpcomingEventsStrip';
import { getClubSettings } from '@/lib/club-settings';
import { getCurrentClubSeason } from '@/lib/club-seasons';
import { renderSeasonContent } from '@/lib/season-content';
import { sponsorMarqueeDurationSeconds } from '@/lib/sponsor-marquee';
import { isDinoCoachPublic } from '@/lib/dino-coach/public-visibility';

type NewsItem = PublicNewsRecord & {
  image?: string;
};

async function getLatestNews(): Promise<NewsItem[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fallbackNews.slice(0, 3) as NewsItem[];
  }

  try {
    const data = await getPublishedNews({ limit: 3 });
    if (!Array.isArray(data)) return [];
    return data as NewsItem[];
  } catch (err) {
    console.error('[home] Failed to load published news; serving static fallback:', err);
    return fallbackNews.slice(0, 3) as NewsItem[];
  }
}

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

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
    // Compact cinematic hero. The section pulls itself up under the fixed
    // navigation (-mt cancels the layout's nav offset) so the homepage nav can
    // sit transparent over the imagery at the top of the page.
    <section className="relative -mt-24 flex min-h-[clamp(34rem,68svh,42rem)] flex-col overflow-hidden text-white lg:-mt-28">
      {/* Scroll-linked depth: the image settles on load and drifts ≤40px as the
          hero leaves the viewport, while the scrims and ambient layers below
          stay fixed — two planes moving at different rates. */}
      <HeroParallax>
        <Image
          src="/images/Turf_Ground.jpg"
          alt="Grinter Reserve at dusk, home of the Newcomb and District Cricket Club"
          fill
          className="object-cover"
          priority
        />
      </HeroParallax>
      {/* Layered maroon -> navy -> near-black cinematic scrim. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(160deg, rgba(45,0,0,0.92) 0%, rgba(45,0,0,0.55) 42%, rgba(8,13,22,0.35) 72%, rgba(8,13,22,0.15) 100%)',
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-2/5"
        style={{ background: 'linear-gradient(to top, rgba(8,13,22,0.9) 0%, transparent 100%)' }}
        aria-hidden="true"
      />
      {/* Abstract cricket-seam geometry: two dashed stitch arcs, desktop only. */}
      <svg
        className="hero-ambient absolute -right-40 top-1/2 hidden h-[130%] w-auto -translate-y-1/2 lg:block"
        viewBox="0 0 600 900"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="520" cy="450" r="400" stroke="rgba(212,160,23,0.14)" strokeWidth="1.5" />
        <circle cx="520" cy="450" r="368" stroke="rgba(212,160,23,0.20)" strokeWidth="2" strokeDasharray="2 14" strokeLinecap="round" />
        <circle cx="520" cy="450" r="432" stroke="rgba(212,160,23,0.16)" strokeWidth="2" strokeDasharray="2 14" strokeLinecap="round" />
      </svg>
      {/* Ambient light layers become visible after the image settles. */}
      <div
        className="hero-ambient absolute inset-0"
        style={{ background: 'radial-gradient(900px 480px at 22% 38%, rgba(212,160,23,0.12), transparent 65%)' }}
        aria-hidden="true"
      />
      <div
        className="hero-ambient absolute inset-0"
        style={{ background: 'radial-gradient(700px 420px at 85% 12%, rgba(22,40,69,0.35), transparent 70%)' }}
        aria-hidden="true"
      />
      {/* Mobile crops put more sky behind the title; deepen the scrim so copy always sits on a dark patch. */}
      <div className="absolute inset-0 sm:hidden bg-maroon-950/30" aria-hidden="true" />
      <div className="container-width relative z-10 flex flex-1 items-center px-4 pb-12 pt-28 sm:items-end sm:px-6 sm:pb-14 sm:pt-32 lg:px-8 lg:pt-36">
        <div className="w-full text-center sm:text-left">
          <ScrollReveal onMount delay={0.2} duration={0.8}>
            <span className="eyebrow-gold">
              Est. {CLUB_ESTABLISHED} &middot; {CLUB_ASSOCIATION}
            </span>
          </ScrollReveal>
          <h1 className="font-display font-bold uppercase leading-[0.95] tracking-tight">
            <MaskReveal delay={0.35}>
              <span className="block text-4xl sm:text-5xl lg:text-6xl">{title}</span>
            </MaskReveal>
            <MaskReveal delay={0.5}>
              <span className="mt-2 block text-2xl italic text-gold-200/90 sm:text-3xl lg:text-4xl">
                Home of the {CLUB_NICKNAME}
              </span>
            </MaskReveal>
          </h1>
          <ScrollReveal onMount delay={0.7} duration={0.8}>
            <p className="mx-auto mb-6 mt-4 max-w-2xl font-body text-base text-maroon-100 sm:mx-0 sm:text-xl">
              {body}
            </p>
          </ScrollReveal>
          <ScrollReveal onMount delay={0.85} duration={0.8}>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <Link href={ctaUrl} className="btn-primary rounded-full px-7 py-3 text-base">
                {ctaLabel}
              </Link>
              <Link href="/fixtures" className="btn-outline-white rounded-full px-7 py-3 text-base">
                View Fixtures
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </div>
      {/* Scroll indicator appears last in the sequence. Decorative, desktop only. */}
      <div
        className="hero-scroll-hint pointer-events-none absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-2 sm:flex"
        aria-hidden="true"
      >
        <span className="font-body text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">Scroll</span>
        <span className="flex h-9 w-5 items-start justify-center rounded-full border border-white/30 p-1.5">
          <span className="hero-scroll-hint-wheel h-1.5 w-1.5 rounded-full bg-gold-300/80" />
        </span>
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

// CMS page_link_cards.icon stores emoji glyphs today; map the known ones onto
// the Lucide set already used across the site so quick-link icons render
// consistently across OS/browser. Unrecognised strings fall through and render
// as-is, so a custom CMS icon can never produce a blank slot. No data change.
const QUICK_LINK_ICONS: Record<string, LucideIcon> = {
  '🏏': Trophy,
  '👥': Users,
  '📅': Calendar,
  '🛒': ShoppingCart,
  '🤝': Handshake,
  '✉️': Mail,
};

function QuickLinkIcon({ icon }: { icon: string }) {
  const Icon = QUICK_LINK_ICONS[icon.trim()];
  if (Icon) {
    return <Icon className="mb-2 h-7 w-7 text-maroon-700 dark:text-maroon-300" aria-hidden="true" />;
  }
  return <span className="mb-2 block text-2xl" aria-hidden="true">{icon}</span>;
}

function QuickLinksSkeleton() {
  return (
    <section className="section-padding bg-surface-card">
      <div className="container-width">
        <div className="mb-8 text-center">
          <span className="section-eyebrow">Quick Links</span>
          <div className="mx-auto h-9 w-64 max-w-full rounded bg-gray-200 animate-pulse mb-3" />
          <div className="mx-auto h-5 w-80 max-w-full rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-full rounded-xl border border-l-4 border-edge-subtle border-l-maroon-700 bg-surface-card p-5 shadow-sm">
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
    <section className="section-padding bg-surface-card">
      <div className="container-width">
        <ScrollReveal className="mb-8 text-center">
          <span className="section-eyebrow">Quick Links</span>
          <h2 className="section-title">{blocks['home.quicklinks']?.title || 'Explore the Club'}</h2>
          <p className="section-subtitle mx-auto">
            {blocks['home.quicklinks']?.body || `Everything you need to know about the ${CLUB_NICKNAME}.`}
          </p>
        </ScrollReveal>
        <ScrollReveal stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <ScrollRevealItem key={link.id}>
            {/* Hover lift lives on the Link; the tilt/spotlight surface is the
                inner TiltCard so Framer's inline transform never fights the
                Tailwind hover translate. The whole card stays one link. */}
            <Link
              href={link.href}
              className="group block h-full rounded-xl focus-ring hover:-translate-y-1 transition-transform duration-300"
            >
              <TiltCard className="h-full rounded-xl">
                <div className="flex h-full flex-col rounded-xl border border-l-4 border-edge-subtle border-l-maroon-700 bg-surface-card p-5 shadow-sm transition-shadow duration-300 group-hover:shadow-lift dark:border-slate-700 dark:border-l-maroon-500">
                  {link.icon && <QuickLinkIcon icon={link.icon} />}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="mb-2 font-display text-lg font-bold text-maroon-800 transition-colors group-hover:text-maroon-700 dark:text-maroon-200">
                      {link.title}
                    </h3>
                    <span className="text-gray-300 text-xl group-hover:text-maroon-500 group-hover:translate-x-1 transition-all duration-200 shrink-0">→</span>
                  </div>
                  <p className="text-content-muted font-body text-sm">{link.description}</p>
                </div>
              </TiltCard>
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
    // The first true "honour board" moment on the page: a full-bleed maroon
    // band rather than a card floating on a tinted section.
    <section className="band-maroon section-padding">
      <div className="container-width">
        <ScrollReveal>
        <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[1fr_auto]">
          <div>
            <span className="eyebrow-gold">Season Update</span>
            <h2 className="mb-2 font-display text-2xl font-bold uppercase tracking-wide text-white sm:text-3xl">{title}</h2>
            <p className="font-body leading-relaxed mb-0 text-white/75">
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
  // getCurrentClubSeason throws when Supabase is unreachable or unconfigured.
  // Every other homepage data source fails safe; without this catch a single
  // failed season lookup replaces the entire homepage with the global error
  // page. Season placeholders simply render their fallbacks with no season.
  const [blocks, currentSeason] = await Promise.all([
    getContentBlocks(['home.season_status']),
    getCurrentClubSeason().catch((err) => {
      console.error('[home] Failed to load current club season; rendering season status without it:', err);
      return null;
    }),
  ]);
  const block = blocks['home.season_status'];
  return (
    <SeasonStatusView
      title={renderSeasonContent(block?.title || 'Season Update', currentSeason)}
      body={renderSeasonContent(block?.body || SEASON_STATUS_DEFAULT_BODY, currentSeason)}
      ctaLabel={renderSeasonContent(block?.cta_label || 'View Results on PlayHQ', currentSeason)}
      ctaUrl={block?.cta_url || PLAYHQ_ORG_URL}
    />
  );
}

function ClubUpdatesSkeleton() {
  return (
    <section className="section-padding surface-blue-band">
      <div className="container-width">
        <div className="mb-8 text-center">
          <span className="section-eyebrow">Club Updates</span>
          <div className="mx-auto h-9 w-56 max-w-full rounded bg-gray-200 animate-pulse mb-3" />
          <div className="mx-auto h-5 w-80 max-w-full rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Card key={index} className="h-full overflow-hidden">
              <div className="aspect-video w-full bg-gray-200 animate-pulse" />
              <CardContent className="p-5">
                <div className="h-4 w-28 rounded bg-gray-200 animate-pulse mb-3" />
                <div className="h-6 w-3/4 rounded bg-gray-200 animate-pulse mb-3" />
                <div className="h-4 w-full rounded bg-gray-200 animate-pulse mb-2" />
                <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

async function ClubUpdatesSection() {
  const [blocks, news, publications] = await Promise.all([
    getContentBlocks(['home.welcome']),
    getLatestNews(),
    getPublishedPublications({ limit: 2 }),
  ]);

  return (
    <section className="section-padding surface-blue-band">
      <div className="container-width">
        <ScrollReveal className="mb-8 text-center">
          <span className="section-eyebrow">Club Updates</span>
          <h2 className="section-title">{blocks['home.welcome']?.title || 'Latest from NDCC'}</h2>
          <p className="section-subtitle mx-auto">
            {blocks['home.welcome']?.body || 'Stay up to date with everything happening at NDCC.'}
          </p>
        </ScrollReveal>
        <div className={publications.length > 0 ? 'grid grid-cols-1 gap-8 xl:grid-cols-[1.7fr_1fr]' : ''}>
          <div>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <h3 className="font-display text-xl font-bold uppercase tracking-wide text-content-primary">Club News</h3>
              <Link href="/news" className="font-body text-sm font-semibold text-maroon-700 hover:underline dark:text-maroon-200">View all news</Link>
            </div>
            <ScrollReveal stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {news.map((article) => {
                const inner = (
                  <Card hover className="h-full overflow-hidden">
                    <div className="relative aspect-video w-full overflow-hidden bg-surface-page">
                      <SafeImage
                        src={article.image_url || article.image || '/images/Womens_Team.jpg'}
                        alt={article.title}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 28vw"
                        fallback={
                          <div className="flex h-full w-full items-center justify-center bg-maroon-800">
                            <span className="font-display text-4xl font-black text-white/30">NDCC</span>
                          </div>
                        }
                      />
                    </div>
                    <CardContent className="p-5">
                      {article.published_at && (
                        <p className="mb-2 font-body text-xs font-semibold uppercase tracking-[0.08em] text-maroon-600 dark:text-maroon-300">
                          {formatDate(article.published_at)}
                        </p>
                      )}
                      <h4 className="mb-2 font-display text-lg font-bold text-content-primary transition-colors group-hover:text-maroon-700">
                        {article.title}
                      </h4>
                      <p className="font-body text-sm text-content-muted">{truncateText(article.content, 90)}</p>
                    </CardContent>
                  </Card>
                );

                return (
                  <ScrollRevealItem key={article.id}>
                    <Link href={`/news/${article.id}`} className="group block h-full rounded-xl focus-ring">
                      <TiltCard className="h-full rounded-xl">{inner}</TiltCard>
                    </Link>
                  </ScrollRevealItem>
                );
              })}
            </ScrollReveal>
          </div>
          {publications.length > 0 && (
            <div>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <h3 className="font-display text-xl font-bold uppercase tracking-wide text-content-primary">Publications</h3>
                <Link href="/publications" className="font-body text-sm font-semibold text-maroon-700 hover:underline dark:text-maroon-200">View all publications</Link>
              </div>
              <ScrollReveal stagger direction="right" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
                {publications.map((publication) => (
                  <PublicationCard key={publication.id} publication={publication} />
                ))}
              </ScrollReveal>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

async function WhatsOnSection() {
  const [{ data: events }, calendarResult] = await Promise.all([
    getPublicEvents(),
    getUpcomingCalendarEvents({ limit: 4, home: true }),
  ]);
  const now = Date.now();
  const upcoming = events
    .filter((event) => {
      const time = Date.parse(String(event.date || ''));
      return Number.isFinite(time) && time >= now - 24 * 60 * 60 * 1000;
    })
    .slice(0, 2);
  const calendarEvents = calendarResult.degraded ? [] : calendarResult.data.map(toCalendarFeedEvent);
  if (upcoming.length === 0 && calendarEvents.length === 0) return null;

  return (
    <section className="section-padding bg-surface-card">
      <div className="container-width">
        <ScrollReveal className="mb-8 text-center">
          <span className="section-eyebrow">What&apos;s On</span>
          <h2 className="section-title">Events &amp; Club Calendar</h2>
        </ScrollReveal>
        <div className={upcoming.length > 0 && calendarEvents.length > 0 ? 'grid grid-cols-1 items-start gap-8 lg:grid-cols-[1.25fr_1fr]' : ''}>
          {upcoming.length > 0 && (
            <div>
              <div className="mb-4 flex items-end justify-between gap-3">
                <h3 className="font-display text-xl font-bold uppercase tracking-wide text-content-primary">Upcoming Events</h3>
                <Link href="/events" className="font-body text-sm font-semibold text-maroon-700 hover:underline dark:text-maroon-200">View all</Link>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {upcoming.map((event) => (
                  <ScrollReveal key={event.id}>
                    <Card hover className="flex h-full flex-col">
                      {event.image_url && (
                        <div className="relative aspect-video w-full bg-surface-page">
                          <SafeImage
                            src={event.image_url}
                            alt={`${event.title} event artwork`}
                            fill
                            className="object-contain"
                            sizes="(max-width: 1024px) 100vw, 40vw"
                            fallback={<div className="absolute inset-0 bg-surface-page" aria-hidden="true" />}
                          />
                        </div>
                      )}
                      <div className="bg-gradient-to-br from-maroon-700 to-maroon-900 px-5 py-3">
                        <p className="font-body text-xs font-semibold uppercase tracking-[0.08em] text-gold-200">{formatDate(event.date)}</p>
                        <h4 className="mt-1 font-display text-lg font-bold text-white">{event.title}</h4>
                      </div>
                      <CardContent className="flex-1 p-4">
                        <p className="mb-3 font-body text-sm text-content-muted">{event.location}</p>
                        <Link href={`/events/${event.id}`} className="font-body text-sm font-semibold text-maroon-700 hover:underline dark:text-maroon-200">View details</Link>
                      </CardContent>
                    </Card>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          )}
          {calendarEvents.length > 0 && (
            <div>
              <div className="mb-4 flex items-end justify-between gap-3">
                <h3 className="font-display text-xl font-bold uppercase tracking-wide text-content-primary">Club Calendar</h3>
                <Link href="/calendar" className="font-body text-sm font-semibold text-maroon-700 hover:underline dark:text-maroon-200">View full calendar</Link>
              </div>
              <UpcomingEventsStrip events={calendarEvents} showViewAll={false} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

async function GalleryPreviewSection() {
  const { data: photos } = await getPublicGallery();
  const preview = photos.slice(0, 4);
  if (preview.length === 0) return null;

  return (
    <section className="section-padding bg-surface-card">
      <div className="container-width">
        <ScrollReveal className="mb-6 text-center">
          <span className="section-eyebrow">Around the Club</span>
          <h2 className="section-title">Gallery</h2>
        </ScrollReveal>
        {/* Cinematic gallery entrance: each frame settles from a gentle zoom on
            a relaxed stagger; hovering re-engages the zoom. Image identity,
            crops, alt text and order are untouched. */}
        <ScrollReveal stagger staggerInterval={0.1} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {preview.map((photo) => (
            <ScrollRevealItem key={photo.id}>
              <div className="group relative aspect-video overflow-hidden rounded-xl bg-surface-page ring-1 ring-maroon-100/60">
                {/* The zoom plane sits inside the clipped frame, so the image
                    settles from 108% behind the mask without ever crossing the
                    grid gap. */}
                <ScrollRevealItem effect="zoom" className="absolute inset-0">
                  <SafeImage
                    src={photo.image_url}
                    alt={photo.alt_text || photo.caption || photo.title}
                    fill
                    className="object-cover img-zoom"
                    sizes="(max-width: 1024px) 50vw, 25vw"
                    fallback={<div className="absolute inset-0 bg-surface-muted" aria-hidden="true" />}
                  />
                </ScrollRevealItem>
              </div>
            </ScrollRevealItem>
          ))}
        </ScrollReveal>
        <div className="mt-6 text-center">
          <Link href="/gallery" className="btn-secondary">View Full Gallery</Link>
        </div>
      </div>
    </section>
  );
}

function SeasonAppointmentsSkeleton() {
  return (
    <section className="section-padding bg-surface-card">
      <div className="container-width">
        <div className="mb-8 text-center">
          <span className="section-eyebrow">Season appointments</span>
          <h2 className="section-title">Season appointments</h2>
        </div>
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="rounded-2xl bg-gray-200 animate-pulse"
              style={{ aspectRatio: '3/4' }}
            />
          ))}
        </div>
        <p className="mt-6 text-center font-body text-sm text-content-muted">
          Season appointments are managed in the CMS. Follow us on{' '}
          <Link href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="text-maroon-700 dark:text-maroon-200 hover:underline font-semibold">
            Facebook
          </Link>{' '}
          for updates.
        </p>
      </div>
    </section>
  );
}

async function SeasonAppointmentsSection() {
  // Server-render only the active season's appointments. Fail closed so stale
  // signings never reappear during an unavailable data-source window.
  let initialAppointments: PublicSeasonAppointment[];
  try {
    initialAppointments = await getPublicSeasonAppointments();
  } catch (err) {
    console.error('[home] Failed to load season appointments; hiding the seasonal section:', err);
    initialAppointments = [];
  }
  return <SeasonAppointmentsMarquee initialAppointments={initialAppointments} />;
}


function SponsorsSkeleton() {
  return (
    <section className="section-padding surface-blue-band">
      <div className="container-width">
        <div className="mb-8 text-center">
          <span className="section-eyebrow">Community Partners</span>
          <div className="mx-auto h-9 w-56 max-w-full rounded bg-gray-200 animate-pulse mb-3" />
          <div className="mx-auto h-5 w-80 max-w-full rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Card key={index} className="h-full border border-edge-blue/60">
              <CardContent className="flex h-full flex-col items-center p-5 text-center">
                <div className="mb-4 h-24 w-full animate-pulse rounded-lg bg-gray-200" />
                <div className="h-5 w-40 rounded bg-gray-200 animate-pulse mb-3" />
                <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link href="/sponsors" className="btn-secondary">
            View All Sponsors
          </Link>
        </div>
      </div>
    </section>
  );
}

async function SponsorsSection() {
  const [blocks, dbSponsors, clubSettings] = await Promise.all([
    getContentBlocks(['home.sponsor_intro', 'home.sponsorship']),
    getPublicSponsors(),
    getClubSettings(),
  ]);

  // getPublicSponsors already backfills missing logo/website fields on live rows
  // and only serves the static list when the query itself fails. A successful
  // empty result is live truth, so the section is simply hidden.
  const sponsors = dbSponsors.data;
  if (sponsors.length === 0) return null;

  const sponsorBlock = blocks['home.sponsor_intro'] || blocks['home.sponsorship'];
  const sponsorshipTitle = sponsorBlock?.title || 'Our Sponsors';
  const sponsorshipBody = sponsorBlock?.body || 'Thanks to all local businesses and partners supporting NDCC.';

  return (
    <section className="section-padding surface-blue-band">
      <div className="container-width">
        <ScrollReveal className="mb-8 text-center">
          <span className="section-eyebrow">Community Partners</span>
          <h2 className="section-title">{sponsorshipTitle}</h2>
          <p className="section-subtitle mx-auto">
            {sponsorshipBody}
          </p>
        </ScrollReveal>
        <ScrollReveal>
          <SponsorsMarquee sponsors={sponsors} durationSeconds={sponsorMarqueeDurationSeconds(clubSettings.sponsor_marquee_speed, sponsors.length)} />
        </ScrollReveal>
      </div>
    </section>
  );
}

async function FantasyTeaserSection() {
  if (!(await isDinoCoachPublic())) return null;
  // Static teaser: copy describes the game itself, so nothing here can go
  // stale or invent scores. Live numbers stay on the fantasy pages.
  const highlights = [
    { label: 'Pick your squad', detail: 'Build an XI under the salary cap' },
    { label: 'Score real points', detail: 'Runs, wickets, catches and more' },
    { label: 'Climb the ladder', detail: 'Round and season leaderboards' },
  ];
  return (
    <section className="section-padding bg-surface-card">
      <div className="container-width">
        <ScrollReveal effect="scale">
          <div className="surface-panel relative overflow-hidden p-6 sm:p-8">
            <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[1.2fr_1fr]">
              <div>
                <span className="section-eyebrow">Dinos Fantasy</span>
                <h2 className="section-title">Dino Coach</h2>
                <p className="section-subtitle mb-5">
                  Back your judgement against the rest of the club. Pick a squad of real NDCC
                  players, captain your stars, and score points from actual match performances
                  across the season.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link href="/fantasy" className="btn-primary">
                    Play Dino Coach
                  </Link>
                  <Link href="/fantasy/leaderboard" className="btn-secondary">
                    View Leaderboard
                  </Link>
                </div>
              </div>
              <ul className="space-y-2">
                {highlights.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-start gap-3 rounded-xl border border-edge-subtle bg-white/70 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800/70"
                  >
                    <Trophy className="h-5 w-5 mt-0.5 shrink-0 text-gold-500" aria-hidden="true" />
                    <div>
                      <p className="font-display font-bold text-maroon-800 dark:text-maroon-200 text-sm uppercase tracking-wide">{item.label}</p>
                      <p className="font-body text-sm text-content-muted">{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

function JuniorsCtaView({ title, body }: { title: string; body: string }) {
  return (
    <section className="band-maroon section-padding">
      <ScrollReveal effect="scale" className="container-width text-center">
        <span className="eyebrow-gold">Get Involved</span>
        <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">
          {title}
        </h2>
        <p className="mx-auto mb-6 max-w-xl font-body text-base text-maroon-100 sm:text-lg">
          {body}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/contact" className="btn-accent px-7 py-3 text-base">
            Get in Touch
          </Link>
          <Link href="/volunteer" className="btn-secondary border-white px-7 py-3 text-base text-white hover:bg-surface-card hover:text-maroon-800">
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
      {/* Client-only splash: plays the club logo reveal over the page on the
          first homepage visit of a session, then fades out to the hero. It
          renders nothing on the server and skips itself entirely on error,
          slow networks, reduced-motion or Save-Data — the page beneath is
          always fully rendered and never waits on it. */}
      <IntroLogoReveal />

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

      {/* Compact club-stat strip directly under the cinematic hero. */}
      <HomeStatsStrip />

      <Suspense fallback={<QuickLinksSkeleton />}>
        <QuickLinksSection />
      </Suspense>

      {/* Live season status / fixtures feature. */}
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

      <Suspense fallback={null}>
        <FantasyTeaserSection />
      </Suspense>

      <Suspense fallback={<ClubUpdatesSkeleton />}>
        <ClubUpdatesSection />
      </Suspense>

      <Suspense fallback={<SeasonAppointmentsSkeleton />}>
        <SeasonAppointmentsSection />
      </Suspense>

      <Suspense fallback={null}>
        <WhatsOnSection />
      </Suspense>

      <Suspense fallback={<SponsorsSkeleton />}>
        <SponsorsSection />
      </Suspense>

      <Suspense fallback={null}>
        <GalleryPreviewSection />
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
