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
import { getFallbackSeasonAppointments, getPublicSeasonAppointments } from '@/lib/public-season-appointments';
import SeasonAppointmentsMarquee from '@/components/home/SeasonAppointmentsMarquee';
import HomeStatsStrip from '@/components/home/HomeStatsStrip';
import { getPageLinkCards } from '@/lib/structured-content';
import { fallbackNews } from '@/lib/fallback-content';
import LogoChip from '@/components/common/LogoChip';
import PublicationCard from '@/components/publications/PublicationCard';
import { getPublishedPublications } from '@/lib/public-publications';
import { getPublicEvents, getPublicGallery, getPublicSponsors } from '@/lib/public-data';
import { getUpcomingCalendarEvents } from '@/lib/calendar/queries';
import { toCalendarFeedEvent } from '@/lib/calendar/format';
import UpcomingEventsStrip from '@/components/calendar/UpcomingEventsStrip';

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
    <section className="relative text-white overflow-hidden" style={{ minHeight: '520px', display: 'flex', flexDirection: 'column' }}>
      <Image
        src="/images/Turf_Ground.jpg"
        alt="Grinter Reserve at dusk, home of the Newcomb and District Cricket Club"
        fill
        className="object-cover animate-ken-burns"
        priority
      />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(45,0,0,0.90) 0%, rgba(45,0,0,0.62) 55%, rgba(45,0,0,0.34) 100%)' }} />
      {/* Mobile crops put more sky behind the title; deepen the scrim so copy always sits on a dark patch. */}
      <div className="absolute inset-0 sm:hidden bg-maroon-950/30" aria-hidden="true" />
      <div className="container-width relative z-10 flex-1 flex items-center section-padding">
        <div className="w-full">
          <ScrollReveal onMount delay={0}>
            <span className="eyebrow-gold">
              Est. {CLUB_ESTABLISHED} &middot; {CLUB_ASSOCIATION}
            </span>
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
    return <Icon className="h-8 w-8 text-maroon-700 mb-3 dark:text-maroon-300" aria-hidden="true" />;
  }
  return <span className="text-3xl mb-3 block" aria-hidden="true">{icon}</span>;
}

function QuickLinksSkeleton() {
  return (
    <section className="section-padding bg-surface-card">
      <div className="container-width">
        <div className="text-center mb-12">
          <span className="section-eyebrow">Quick Links</span>
          <div className="mx-auto h-9 w-64 max-w-full rounded bg-gray-200 animate-pulse mb-3" />
          <div className="mx-auto h-5 w-80 max-w-full rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-full bg-surface-card border border-edge-subtle border-l-4 border-l-maroon-700 rounded-xl p-6 shadow-sm">
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
              className="group h-full bg-surface-card border border-edge-subtle border-l-4 border-l-maroon-700 rounded-xl p-6 flex flex-col shadow-sm hover:shadow-lift hover:-translate-y-1 transition-all duration-300 dark:border-slate-700 dark:border-l-maroon-500"
            >
              {link.icon && <QuickLinkIcon icon={link.icon} />}
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-xl font-display font-bold text-maroon-800 dark:text-maroon-200 mb-2 group-hover:text-maroon-700 transition-colors">
                  {link.title}
                </h3>
                <span className="text-gray-300 text-xl group-hover:text-maroon-500 group-hover:translate-x-1 transition-all duration-200 shrink-0">→</span>
              </div>
              <p className="text-content-muted font-body text-sm">{link.description}</p>
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
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-8 items-center">
          <div>
            <span className="eyebrow-gold">Season Update</span>
            <h2 className="text-2xl sm:text-3xl font-display font-bold uppercase tracking-wide text-white mb-3">{title}</h2>
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
    <section className="section-padding surface-blue-band">
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
    <section className="section-padding surface-blue-band">
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
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-page">
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
                    <p className="text-xs uppercase tracking-[0.08em] text-maroon-600 dark:text-maroon-300 font-body font-semibold mb-2">
                      {formatDate(article.published_at)}
                    </p>
                  )}
                  <h3 className="text-lg font-display font-bold text-content-primary mb-2 group-hover:text-maroon-700 transition-colors">
                    {article.title}
                  </h3>
                  <p className="text-content-muted font-body text-sm">
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

async function LatestPublicationsSection() {
  // Live CMS data; the whole section is hidden when nothing is published.
  const publications = await getPublishedPublications({ limit: 3 });
  if (publications.length === 0) return null;

  return (
    <section className="section-padding">
      <div className="container-width">
        <ScrollReveal className="text-center mb-12">
          <span className="section-eyebrow">Publications</span>
          <h2 className="section-title">Newsletters &amp; Match Reports</h2>
          <p className="section-subtitle mx-auto">
            The latest from the club in writing — newsletters and weekly match reports.
          </p>
        </ScrollReveal>
        <ScrollReveal stagger className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {publications.map((publication) => (
            <PublicationCard key={publication.id} publication={publication} />
          ))}
        </ScrollReveal>
        <div className="text-center mt-10">
          <Link href="/publications" className="btn-secondary">
            View All Publications
          </Link>
        </div>
      </div>
    </section>
  );
}

async function EventsSection() {
  const { data: events } = await getPublicEvents();
  const now = Date.now();
  const upcoming = events
    .filter((event) => {
      const time = Date.parse(String(event.date || ''));
      return Number.isFinite(time) && time >= now - 24 * 60 * 60 * 1000;
    })
    .slice(0, 3);
  if (upcoming.length === 0) return null;

  return (
    <section className="section-padding bg-surface-card">
      <div className="container-width">
        <ScrollReveal className="text-center mb-10">
          <span className="section-eyebrow">What&apos;s On</span>
          <h2 className="section-title">Upcoming Events</h2>
        </ScrollReveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {upcoming.map((event) => (
            <ScrollReveal key={event.id}>
              <Card hover className="h-full flex flex-col">
                {event.image_url && (
                  <div className="relative aspect-[4/3] w-full bg-surface-page">
                    <SafeImage
                      src={event.image_url}
                      alt={`${event.title} event artwork`}
                      fill
                      className="object-contain"
                      sizes="(max-width: 1024px) 100vw, 33vw"
                      fallback={<div className="absolute inset-0 bg-surface-page" aria-hidden="true" />}
                    />
                  </div>
                )}
                <div className="bg-gradient-to-br from-maroon-700 to-maroon-900 px-6 py-4">
                  <p className="text-gold-200 font-body text-xs font-semibold uppercase tracking-[0.08em]">{formatDate(event.date)}</p>
                  <h3 className="text-white font-display font-bold text-xl mt-1">{event.title}</h3>
                </div>
                <CardContent className="flex-1">
                  <p className="font-body text-sm text-content-muted mb-2">{event.location}</p>
                  <p className="font-body text-content-secondary text-sm leading-relaxed mb-4">{truncateText(event.description, 130)}</p>
                  <Link
                    href={`/events/${event.id}`}
                    className="inline-flex items-center text-maroon-700 dark:text-maroon-200 hover:text-maroon-500 font-body font-semibold text-sm transition-colors"
                  >
                    View Details
                  </Link>
                </CardContent>
              </Card>
            </ScrollReveal>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link href="/events" className="btn-secondary">View All Events</Link>
        </div>
      </div>
    </section>
  );
}

async function CalendarPreviewSection() {
  // Hidden entirely when nothing is published or the live query degrades —
  // never stale fallback calendar content.
  const result = await getUpcomingCalendarEvents({ limit: 4, home: true });
  if (result.degraded || result.data.length === 0) return null;
  const events = result.data.map(toCalendarFeedEvent);

  return (
    <section className="section-padding surface-blue-band">
      <div className="container-width">
        <ScrollReveal className="text-center mb-10">
          <span className="section-eyebrow">Club Calendar</span>
          <h2 className="section-title">What&apos;s On at the Club</h2>
        </ScrollReveal>
        <div className="max-w-3xl mx-auto">
          <UpcomingEventsStrip events={events} showViewAll={false} />
        </div>
        <div className="text-center mt-8">
          <Link href="/calendar" className="btn-secondary">View Full Calendar</Link>
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
        <ScrollReveal className="text-center mb-10">
          <span className="section-eyebrow">Around the Club</span>
          <h2 className="section-title">Gallery</h2>
        </ScrollReveal>
        <ScrollReveal stagger className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {preview.map((photo) => (
            <ScrollRevealItem key={photo.id}>
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-surface-page ring-1 ring-maroon-100/60">
                <SafeImage
                  src={photo.image_url}
                  alt={photo.alt_text || photo.caption || photo.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 50vw, 25vw"
                  fallback={<div className="absolute inset-0 bg-surface-muted" aria-hidden="true" />}
                />
              </div>
            </ScrollRevealItem>
          ))}
        </ScrollReveal>
        <div className="text-center mt-8">
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
        <div className="text-center mb-12">
          <span className="section-eyebrow">Season appointments</span>
          <h2 className="section-title">Season appointments</h2>
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
        <p className="text-center text-content-muted font-body text-sm mt-8">
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
  // Server-render the live appointments so seed data never paints first; the
  // static list only stands in when Supabase is unconfigured or the query fails.
  let initialAppointments;
  try {
    initialAppointments = await getPublicSeasonAppointments();
  } catch (err) {
    console.error('[home] Failed to load season appointments; serving static fallback:', err);
    initialAppointments = getFallbackSeasonAppointments();
  }
  return <SeasonAppointmentsMarquee initialAppointments={initialAppointments} />;
}


function SponsorsSkeleton() {
  return (
    <section className="section-padding surface-blue-band">
      <div className="container-width">
        <div className="text-center mb-10">
          <span className="section-eyebrow">Community Partners</span>
          <div className="mx-auto h-9 w-56 max-w-full rounded bg-gray-200 animate-pulse mb-3" />
          <div className="mx-auto h-5 w-80 max-w-full rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[0, 1, 2].map((index) => (
            <Card key={index} className="h-full border border-edge-blue/60">
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
    getPublicSponsors(),
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
            {[false, true].map((isDuplicateSequence) => (
            <div
              key={isDuplicateSequence ? 'duplicate' : 'primary'}
              className="contents"
              aria-hidden={isDuplicateSequence || undefined}
            >
            {sponsors.map((sponsor, index) => {
              const brandedFallback = (
                <div className="flex h-full w-full items-center justify-center rounded-xl bg-maroon-800 px-3 text-center">
                  <span className="font-display text-sm font-bold uppercase leading-tight tracking-wide text-gold-200">
                    {sponsor.name}
                  </span>
                </div>
              );
              const chip = (
                <>
                  <LogoChip
                    name={sponsor.name}
                    src={sponsor.logo_url}
                    surfaceMode={sponsor.logo_surface_mode}
                    paddingClassName={sponsor.logo_padding}
                    objectPosition={sponsor.logo_object_position}
                    width={190}
                    height={70}
                    sizes="190px"
                    className="h-28 w-56 rounded-2xl shadow-soft ring-1 ring-maroon-100/60 transition-all duration-300 group-hover:shadow-lift group-hover:ring-2 group-hover:ring-maroon-200/70 group-hover:-translate-y-1"
                    imageClassName="max-h-16 w-auto"
                    fallback={brandedFallback}
                  />
                  <span className="sponsor-caption">{sponsor.name}</span>
                </>
              );

              if (!sponsor.website) {
                return (
                  <div key={`${sponsor.id}-${index}`} className="group flex-none" aria-label={isDuplicateSequence ? undefined : sponsor.name}>
                    {chip}
                  </div>
                );
              }

              return (
                <a
                  key={`${sponsor.id}-${index}`}
                  href={sponsor.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={isDuplicateSequence ? undefined : `Visit ${sponsor.name} website`}
                  tabIndex={isDuplicateSequence ? -1 : undefined}
                  className="group block flex-none rounded-2xl focus-ring"
                >
                  {chip}
                </a>
              );
            })}
            </div>
            ))}
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

function FantasyTeaserSection() {
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
        <ScrollReveal>
          <div className="surface-panel p-8 sm:p-10 lg:p-12 overflow-hidden relative">
            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-8 items-center">
              <div>
                <span className="section-eyebrow">Dinos Fantasy</span>
                <h2 className="section-title">Fantasy Cricket League</h2>
                <p className="section-subtitle mb-6">
                  Back your judgement against the rest of the club. Pick a squad of real NDCC
                  players, captain your stars, and score points from actual match performances
                  across the season.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link href="/fantasy" className="btn-primary">
                    Play Fantasy Cricket
                  </Link>
                  <Link href="/fantasy/leaderboard" className="btn-secondary">
                    View Leaderboard
                  </Link>
                </div>
              </div>
              <ul className="space-y-3">
                {highlights.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-start gap-3 rounded-xl border border-edge-subtle bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70"
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
      <ScrollReveal className="container-width text-center">
        <span className="eyebrow-gold">Get Involved</span>
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
          <Link href="/volunteer" className="btn-secondary border-white text-white hover:bg-surface-card hover:text-maroon-800 text-lg px-8 py-4">
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

      <HomeStatsStrip />

      <Suspense fallback={<QuickLinksSkeleton />}>
        <QuickLinksSection />
      </Suspense>

      <Suspense fallback={<NewsSkeleton />}>
        <NewsSection />
      </Suspense>

      <Suspense fallback={null}>
        <LatestPublicationsSection />
      </Suspense>

      <Suspense fallback={null}>
        <EventsSection />
      </Suspense>

      <Suspense fallback={null}>
        <CalendarPreviewSection />
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

      <Suspense fallback={<SeasonAppointmentsSkeleton />}>
        <SeasonAppointmentsSection />
      </Suspense>

      <FantasyTeaserSection />

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
