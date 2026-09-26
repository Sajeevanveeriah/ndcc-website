// ISR: regenerated at most every 60s and on demand after admin writes
// (lib/server/revalidate-public.ts). 'force-static' lets the Supabase reads,
// which use cache: 'no-store' fetches, run during static regeneration instead
// of opting the route into per-request rendering. This route reads no
// cookies, headers or searchParams.
export const dynamic = 'force-static';
export const revalidate = 60;

import type { Metadata } from 'next';
import { cache, Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import SafeImage from '@/components/common/SafeImage';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, CalendarDays, Camera, Coins, ExternalLink, HandHeart, Info, Mail, MapPin, Newspaper, ShoppingBag, Trophy, Users } from 'lucide-react';
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
import ClubIntro from '@/components/home/ClubIntro';
import SeasonAppointmentsMarquee from '@/components/home/SeasonAppointmentsMarquee';
import HomeStatsStrip from '@/components/home/HomeStatsStrip';
import { getPageLinkCards } from '@/lib/structured-content';
import SponsorsMarquee from '@/components/home/SponsorsMarquee';
import { getPublishedPublications, publicationTypeLabel } from '@/lib/public-publications';
import { getPublicEvents, getPublicGallery, getPublicSponsors } from '@/lib/public-data';
import { getUpcomingCalendarEvents } from '@/lib/calendar/queries';
import { CALENDAR_EVENT_TYPE_LABELS } from '@/lib/calendar/types';
import { getClubSettings } from '@/lib/club-settings';
import { getCurrentClubSeason } from '@/lib/club-seasons';
import { renderSeasonContent } from '@/lib/season-content';
import { sponsorMarqueeDurationSeconds } from '@/lib/sponsor-marquee';
import { isDinoCoachPublic } from '@/lib/dino-coach/public-visibility';
import { getPlayHQPublicData } from '@/lib/playhq/client';
import CookieDoughFundraiserFeature from '@/components/home/CookieDoughFundraiserFeature';
import { getJuniorGetActiveVouchers, type JuniorGetActiveVouchers } from '@/lib/home-promotions';
import { getCookieDoughCampaign, type CookieDoughCampaign } from '@/lib/server/site-promotions';
import {
  allWithinDays,
  comingUpDateParts,
  fixturesWithinDays,
  formatClubTime,
  formatMatchDayDate,
  mergeComingUp,
  selectMatchDayBoard,
  unavailableGradesFromWarnings,
  type ComingUpItem,
  type MatchDayEntry,
} from '@/components/home/match-day';

// Shared only for this render; the next request still reads live CMS content.
const getHomeBlocks = cache(() => getContentBlocks(['home.hero', 'home.juniors', 'home.quicklinks', 'home.season_status', 'home.welcome']));

const getHomeSeason = cache(() => getCurrentClubSeason().catch((error) => {
  console.warn('[home] Current season temporarily unavailable:', error instanceof Error ? error.message : 'unknown');
  return null;
}));

// Seeded CMS defaults that read as filler. A CMS value equal to one of these
// is treated as unset so the page shows its own short heading (or nothing);
// any other text an editor enters is still shown exactly as written.
const GENERIC_CMS_COPY = [
  'Explore the Club',
  'Everything you need to know about the Dinos.',
  'Latest from NDCC',
  'Stay up to date with everything happening at NDCC.',
  'Ready to join the Dinos?',
  'Whether you\'re a seasoned cricketer or picking up a bat for the first time, there is a place for you at NDCC.',
  'Thanks to all local businesses and partners supporting NDCC.',
].map((text) => normaliseCopy(text));

function normaliseCopy(value: string) {
  return value.replace(/[’‘]/g, '\'').replace(/\s+/g, ' ').trim().toLowerCase();
}

function cmsCopy(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || GENERIC_CMS_COPY.includes(normaliseCopy(text))) return null;
  return text;
}

type NewsItem = PublicNewsRecord & {
  image?: string;
};

async function getLatestNews(): Promise<NewsItem[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }

  try {
    const data = await getPublishedNews({ limit: 4 });
    if (!Array.isArray(data)) return [];
    return data as NewsItem[];
  } catch (err) {
    console.error('[home] Failed to load published news; news temporarily unavailable:', err);
    return [];
  }
}

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

// Left-aligned section heading on a thin rule, with an optional text link.
function SectionHeading({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-2" data-reveal="">
      <span aria-hidden="true" className="basis-full"><span className="brand-rule" /></span>
      <h2 id={id} className="font-display text-3xl font-semibold tracking-[-0.035em] text-content-primary sm:text-4xl">{title}</h2>
      {children && <div className="flex flex-wrap gap-x-6">{children}</div>}
    </div>
  );
}

const headingLinkClass = 'club-text-link text-base font-semibold';

const HERO_DEFAULT_BODY = `Home of the ${CLUB_NICKNAME}. Est. ${CLUB_ESTABLISHED}.`;

function seasonLine(name: string | null | undefined) {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return /season/i.test(trimmed) ? trimmed : `${trimmed} season`;
}

function HeroView({
  title,
  body,
  ctaLabel,
  ctaUrl,
  season = null,
  stats = null,
  vouchers = null,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  season?: string | null;
  stats?: ReactNode;
  vouchers?: JuniorGetActiveVouchers | null;
}) {
  return (
    <section className="club-home-hero" aria-labelledby="home-title">
      <div className="container-width grid items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-8 lg:py-24">
        <div className="club-home-copy">
          <p className="club-kicker"><span aria-hidden="true" className="mr-2.5 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-gold-400 align-middle" />Est. {CLUB_ESTABLISHED} <span aria-hidden="true"> / </span> {CLUB_ASSOCIATION}</p>
          <h1 id="home-title" className="club-home-title">{title}</h1>
          <p className="mt-5 font-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl"><span className="text-brand-gradient">Home of the {CLUB_NICKNAME}.</span></p>
          {season && <p className="mt-3 text-base text-content-muted">{season}</p>}
          {body && !/^Home of the (Mighty )?Dinos/i.test(body) && <p className="mt-5 max-w-xl text-lg leading-relaxed text-content-secondary">{body}</p>}
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href={ctaUrl} className="btn-primary">{ctaLabel}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            <Link href="/fixtures" className="btn-secondary">View Fixtures</Link>
          </div>
          {vouchers && (
            <p className="mt-4 text-base font-semibold">
              <a href={`#${vouchers.anchorId}`} className="club-text-link">{vouchers.heroLinkLabel}</a>
            </p>
          )}
          {stats}
        </div>
        <div className="relative">
          <div aria-hidden="true" className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-maroon-700/25 via-sky_accent/25 to-gold-400/30 blur-3xl dark:from-maroon-600/40 dark:via-sky_accent/10 dark:to-gold-400/15" />
          <ClubIntro />
        </div>
      </div>
    </section>
  );
}

async function HeroSection() {
  const [blocks, season, vouchers] = await Promise.all([getHomeBlocks(), getHomeSeason(), getJuniorGetActiveVouchers().catch(() => null)]);
  return (
    <HeroView
      title={blocks['home.hero']?.title || CLUB_NAME}
      body={blocks['home.hero']?.body || HERO_DEFAULT_BODY}
      ctaLabel={blocks['home.hero']?.cta_label || 'Join the Club'}
      ctaUrl={blocks['home.hero']?.cta_url || '/join'}
      season={seasonLine(season?.name)}
      vouchers={vouchers}
      stats={<Suspense fallback={null}><HomeStatsStrip /></Suspense>}
    />
  );
}

// ---------------------------------------------------------------------------
// Fixtures: match-day board (PlayHQ) plus the CMS season status.

type HomeMatchDay = { board: MatchDayEntry[]; clubPlayHQUrl: string } | null;

// One PlayHQ read per render, shared by the board and "This week". Hidden
// (null) when PlayHQ is not configured, errored or lists no NDCC teams.
const getHomeMatchDay = cache(async (): Promise<HomeMatchDay> => {
  const [playhq, settings] = await Promise.all([
    getPlayHQPublicData().catch((error) => {
      console.warn('[home] PlayHQ data temporarily unavailable:', error instanceof Error ? error.message : 'unknown');
      return null;
    }),
    getClubSettings(),
  ]);
  if (!playhq || !playhq.configured || playhq.error || playhq.teams.length === 0) return null;
  const board = selectMatchDayBoard(playhq.teams, playhq.fixtures, Date.now(), unavailableGradesFromWarnings(playhq.warnings));
  if (board.length === 0) return null;
  return { board, clubPlayHQUrl: settings.playhq_url || PLAYHQ_ORG_URL };
});

const SEASON_STATUS_DEFAULT_BODY = 'Match-day notices and club announcements are posted on our';

function ExternalLinkIcon() {
  return <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

function MatchDayCard({ entry, clubPlayHQUrl }: { entry: MatchDayEntry; clubPlayHQUrl: string }) {
  const grade = entry.gradeName && entry.gradeName !== entry.teamName ? entry.gradeName : null;
  const fixture = entry.fixture;
  if (!fixture) return null;
  const home = /home/i.test(fixture.homeAway || '');
  return (
    <li className="card card-interactive fixture-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-content-primary">
          <CalendarDays className="h-4 w-4 text-maroon-700 dark:text-sky_accent" aria-hidden="true" />
          {fixture.startsAt ? <time dateTime={fixture.startsAt}>{formatMatchDayDate(fixture.startsAt)}</time> : 'Date TBC'}
        </span>
        {fixture.homeAway && <span className={home ? 'badge-home' : 'badge-away'}>{fixture.homeAway}</span>}
      </div>
      <div>
        <p className="font-display text-xl font-semibold tracking-[-0.02em] text-content-primary">{entry.teamName}</p>
        {grade && <p className="text-sm text-content-muted">{grade}</p>}
      </div>
      <div className="mt-auto border-t border-edge-subtle pt-4 dark:border-white/10">
        <p className="text-base text-content-secondary"><span className="text-content-muted">v</span> <span className="font-semibold text-content-primary">{fixture.opponent}</span></p>
        {fixture.venue && <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-content-muted"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{fixture.venue}</p>}
        <a href={fixture.playHQUrl || clubPlayHQUrl} target="_blank" rel="noopener noreferrer" className="club-text-link mt-1 flex gap-1.5 text-sm font-semibold">
          View on PlayHQ<span className="sr-only">: {entry.teamName} v {fixture.opponent}</span>
          <ExternalLinkIcon />
        </a>
      </div>
    </li>
  );
}

function PendingFixtureRow({ entry, clubPlayHQUrl }: { entry: MatchDayEntry; clubPlayHQUrl: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3">
      <span className="font-semibold text-content-primary">{entry.teamName}</span>
      {entry.state === 'unavailable' ? (
        <span className="text-sm text-content-muted">
          Fixture details could not be loaded here.{' '}
          <a href={clubPlayHQUrl} target="_blank" rel="noopener noreferrer" className="club-text-link text-sm font-semibold">
            Check PlayHQ<span className="sr-only"> for {entry.teamName}</span>
          </a>
        </span>
      ) : (
        <span className="text-sm text-content-muted">Fixture not yet released by GCA</span>
      )}
    </li>
  );
}

function FixturesView({
  statusTitle,
  statusBody,
  ctaLabel,
  ctaUrl,
  matchDay = null,
}: {
  statusTitle: string;
  statusBody: string;
  ctaLabel: string;
  ctaUrl: string;
  matchDay?: HomeMatchDay;
}) {
  return (
    <section className="home-band border-b border-edge-subtle py-14 sm:py-20" aria-labelledby="home-fixtures-title">
      <div className="container-width px-4 sm:px-6 lg:px-8">
        <SectionHeading id="home-fixtures-title" title={matchDay ? 'Next matches' : 'Fixtures'}>
          <Link href="/fixtures" className={headingLinkClass}>Fixtures and results</Link>
        </SectionHeading>
        {matchDay && matchDay.board.some((entry) => entry.fixture) && (
          <ul className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Next fixture for each NDCC team" data-reveal-stagger="">
            {matchDay.board.filter((entry) => entry.fixture).map((entry) => <MatchDayCard key={entry.teamId} entry={entry} clubPlayHQUrl={matchDay.clubPlayHQUrl} />)}
          </ul>
        )}
        {matchDay && matchDay.board.some((entry) => !entry.fixture) && (
          <div className="glass-panel mb-10 px-5 py-2">
            <ul className="divide-y divide-edge-subtle dark:divide-white/10" aria-label="Teams awaiting their next fixture">
              {matchDay.board.filter((entry) => !entry.fixture).map((entry) => <PendingFixtureRow key={entry.teamId} entry={entry} clubPlayHQUrl={matchDay.clubPlayHQUrl} />)}
            </ul>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="max-w-3xl">
            <h3 className="font-display text-lg font-semibold text-content-primary">{statusTitle}</h3>
            <p className="mt-1 text-base leading-relaxed text-content-secondary">
              {statusBody}{' '}
              <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-maroon-700 underline underline-offset-4 dark:text-sky_accent">
                Facebook page
              </a>.
            </p>
          </div>
          <a href={ctaUrl} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center gap-2 whitespace-nowrap">
            {ctaLabel}
            <ExternalLinkIcon />
          </a>
        </div>
      </div>
    </section>
  );
}

async function FixturesSection() {
  const [blocks, currentSeason, matchDay] = await Promise.all([getHomeBlocks(), getHomeSeason(), getHomeMatchDay()]);
  const block = blocks['home.season_status'];
  return (
    <FixturesView
      statusTitle={renderSeasonContent(block?.title || 'Season Update', currentSeason)}
      statusBody={renderSeasonContent(block?.body || SEASON_STATUS_DEFAULT_BODY, currentSeason)}
      ctaLabel={renderSeasonContent(block?.cta_label || 'View Results on PlayHQ', currentSeason)}
      ctaUrl={block?.cta_url || PLAYHQ_ORG_URL}
      matchDay={matchDay}
    />
  );
}

// ---------------------------------------------------------------------------
// This week: fixtures in the next seven days, the next two published club
// events and the upcoming home-page calendar entries, as one dated list.

const COMING_UP_KIND_LABEL: Record<ComingUpItem['kind'], string> = { fixture: 'Fixture', event: 'Club event', calendar: 'Calendar' };

function ComingUpRow({ item, kindLabel }: { item: ComingUpItem; kindLabel: string }) {
  const parts = comingUpDateParts(item.startsAt);
  const cancelled = item.status === 'cancelled';
  const content = (
    <>
      <span className="date-tile">
        {parts && (
          <>
            <span className="text-xs font-semibold uppercase leading-none tracking-wide text-maroon-700 dark:text-sky_accent">{parts.weekday}</span>
            <span className="font-display text-2xl font-semibold leading-tight text-content-primary">{parts.day}</span>
            <span className="text-xs leading-none text-content-muted">{parts.month}</span>
          </>
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-content-muted">
          {kindLabel}
          {item.status && <span className="ml-2 text-maroon-700 dark:text-maroon-300">{cancelled ? 'Cancelled' : 'Postponed'}</span>}
        </span>
        <span className={`block font-display text-lg font-semibold text-content-primary group-hover:underline ${cancelled ? 'line-through' : ''}`}>{item.title}</span>
        {item.detail && <span className="block text-base text-content-secondary">{item.detail}</span>}
      </span>
    </>
  );
  const rowClass = 'group grid min-h-11 grid-cols-[4rem_minmax(0,1fr)] items-center gap-5 py-4 focus-ring';
  return (
    <li>
      {item.external ? (
        <a href={item.href} target="_blank" rel="noopener noreferrer" className={rowClass}>{content}</a>
      ) : (
        <Link href={item.href} className={rowClass}>{content}</Link>
      )}
    </li>
  );
}

async function ThisWeekSection() {
  const now = Date.now();
  const [matchDay, { data: events }, calendarResult] = await Promise.all([
    getHomeMatchDay(),
    getPublicEvents(),
    getUpcomingCalendarEvents({ limit: 4, home: true }),
  ]);

  const fixtureItems: ComingUpItem[] = matchDay
    ? fixturesWithinDays(matchDay.board, now).flatMap((entry) => {
        const fixture = entry.fixture;
        if (!fixture?.startsAt) return [];
        const detail = [formatClubTime(fixture.startsAt), fixture.homeAway, fixture.venue].filter(Boolean).join(', ');
        return [{
          key: `fixture-${entry.teamId}-${fixture.id}`,
          kind: 'fixture' as const,
          startsAt: fixture.startsAt,
          title: `${entry.teamName} v ${fixture.opponent}`,
          detail: detail || null,
          href: fixture.playHQUrl || '/fixtures',
          external: Boolean(fixture.playHQUrl),
          status: null,
        }];
      })
    : [];

  const eventItems: ComingUpItem[] = events
    .filter((event) => {
      const time = Date.parse(String(event.date || ''));
      return Number.isFinite(time) && time >= now - 24 * 60 * 60 * 1000;
    })
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .slice(0, 2)
    .map((event) => ({
      key: `event-${event.id}`,
      kind: 'event' as const,
      startsAt: event.date,
      title: event.title,
      detail: [formatClubTime(event.date), event.location?.trim()].filter(Boolean).join(', ') || null,
      href: `/events/${event.id}`,
      external: false,
      status: null,
    }));

  const calendarItems: ComingUpItem[] = (calendarResult.degraded ? [] : calendarResult.data).map((event) => {
    const cancelled = event.status === 'cancelled';
    const target = cancelled ? null : event.cta_url || event.external_url;
    return {
      key: `calendar-${event.id}`,
      kind: 'calendar' as const,
      startsAt: event.start_at,
      title: event.title,
      detail: [event.all_day ? 'All day' : formatClubTime(event.start_at), event.location?.trim()].filter(Boolean).join(', ') || null,
      href: target || '/calendar',
      external: Boolean(target && /^https?:\/\//.test(target)),
      status: event.status === 'cancelled' || event.status === 'postponed' ? event.status : null,
    };
  });
  const calendarTypeLabels = new Map((calendarResult.degraded ? [] : calendarResult.data).map((event) => [
    `calendar-${event.id}`,
    CALENDAR_EVENT_TYPE_LABELS[event.event_type] ?? COMING_UP_KIND_LABEL.calendar,
  ]));

  const items = mergeComingUp([...fixtureItems, ...eventItems, ...calendarItems]);
  if (items.length === 0) return null;

  return (
    <section className="bg-surface-page py-14 sm:py-20" aria-labelledby="this-week-title">
      <div className="container-width px-4 sm:px-6 lg:px-8">
        <SectionHeading id="this-week-title" title={allWithinDays(items, now) ? 'This week' : 'Coming up'}>
          <Link href="/calendar" className={headingLinkClass}>Club calendar</Link>
          <Link href="/events" className={headingLinkClass}>Events</Link>
        </SectionHeading>
        <ul className="max-w-3xl divide-y divide-edge-subtle" data-reveal-stagger="">
          {items.map((item) => (
            <ComingUpRow key={item.key} item={item} kindLabel={calendarTypeLabels.get(item.key) ?? COMING_UP_KIND_LABEL[item.kind]} />
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Club news: one lead story, a short list and the latest publication.

function ClubNewsSkeleton() {
  return (
    <section className="border-y border-edge-subtle bg-surface-card py-14 sm:py-20" aria-labelledby="club-news-title">
      <div className="container-width px-4 sm:px-6 lg:px-8">
        <SectionHeading id="club-news-title" title="Club news" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="aspect-video w-full animate-pulse rounded-xl bg-surface-muted" />
          <div className="space-y-4">
            {[0, 1, 2].map((index) => <div key={index} className="h-12 animate-pulse rounded bg-surface-muted" />)}
          </div>
        </div>
      </div>
    </section>
  );
}

async function ClubUpdatesSection() {
  const [blocks, news, publications] = await Promise.all([
    getHomeBlocks(),
    getLatestNews(),
    getPublishedPublications({ limit: 1 }).catch(() => null),
  ]);
  const [lead, ...rest] = news;
  const publication = publications?.[0] ?? null;
  const intro = cmsCopy(blocks['home.welcome']?.body);

  return (
    <section className="border-y border-edge-subtle bg-surface-card py-14 sm:py-20" aria-labelledby="club-news-title">
      <div className="container-width px-4 sm:px-6 lg:px-8">
        <SectionHeading id="club-news-title" title={cmsCopy(blocks['home.welcome']?.title) || 'Club news'}>
          <Link href="/news" className={headingLinkClass}>All news</Link>
        </SectionHeading>
        {intro && <p className="-mt-2 mb-6 max-w-2xl text-base text-content-secondary">{intro}</p>}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          {lead ? (
            <article>
              <Link href={`/news/${lead.id}`} className="group block rounded-xl focus-ring">
                <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-surface-page">
                  <SafeImage
                    src={lead.image_url || lead.image || '/images/Womens_Team.jpg'}
                    alt={lead.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 60vw"
                    fallback={
                      <div className="flex h-full w-full items-center justify-center bg-maroon-800">
                        <span className="font-display text-4xl font-black text-white/30">NDCC</span>
                      </div>
                    }
                  />
                </div>
                {lead.published_at && (
                  <p className="mt-4 text-sm font-semibold text-maroon-700 dark:text-maroon-300">
                    <time dateTime={lead.published_at}>{formatDate(lead.published_at)}</time>
                  </p>
                )}
                <h3 className="mt-1 font-display text-2xl font-semibold text-content-primary group-hover:underline">{lead.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-content-secondary">{truncateText(lead.content, 180)}</p>
              </Link>
            </article>
          ) : (
            <p className="text-base text-content-muted">
              News is temporarily unavailable. <Link href="/news" className="underline">Try the news page</Link> or visit our <a href={FACEBOOK_URL} className="underline">Facebook page</a>.
            </p>
          )}
          <div className="space-y-8">
            {rest.length > 0 && (
              <div>
                <h3 className="mb-2 font-display text-lg font-semibold text-content-primary">More news</h3>
                <ul className="divide-y divide-edge-subtle border-y border-edge-subtle">
                  {rest.map((article) => (
                    <li key={article.id}>
                      <Link href={`/news/${article.id}`} className="group block min-h-11 py-3 focus-ring">
                        {article.published_at && <span className="block text-sm text-content-muted">{formatDate(article.published_at)}</span>}
                        <span className="block font-semibold text-content-primary group-hover:underline">{article.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {publications === null && (
              <p className="text-sm text-content-muted">Publications are temporarily unavailable. <Link href="/publications" className="underline">Try again</Link>.</p>
            )}
            {publication && (
              <div>
                <h3 className="mb-2 font-display text-lg font-semibold text-content-primary">Latest publication</h3>
                <Link href={`/publications/${publication.slug}`} className="group block min-h-11 border-y border-edge-subtle py-3 focus-ring">
                  <span className="block text-sm text-content-muted">
                    {publicationTypeLabel(publication.publication_type)}, {formatDate(publication.issue_date)}
                  </span>
                  <span className="block font-semibold text-content-primary group-hover:underline">{publication.title}</span>
                  {publication.summary && <span className="mt-1 block text-sm text-content-secondary">{truncateText(publication.summary, 120)}</span>}
                </Link>
                <Link href="/publications" className="club-text-link mt-2 text-sm font-semibold">All publications</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Get involved: fixed text links, date-gated promotions and CMS quick links.

// CMS page_link_cards.icon stores emoji glyphs. Known ones map onto a small
// fixed Lucide set; anything else (including the cricket bat, which has no
// honest Lucide equivalent) gets the neutral arrow, so a raw emoji never
// renders. No data change.
const QUICK_LINK_ICONS: Record<string, LucideIcon> = {
  '👥': Users,
  '📅': CalendarDays,
  '🗓️': CalendarDays,
  '🛒': ShoppingBag,
  '🛍️': ShoppingBag,
  '🤝': HandHeart,
  '✉️': Mail,
  '✉': Mail,
  '📧': Mail,
  '📰': Newspaper,
  '📷': Camera,
  '📸': Camera,
  '🏆': Trophy,
  'ℹ️': Info,
};

function QuickLinkIcon({ icon }: { icon: string | null | undefined }) {
  const Icon = (icon && QUICK_LINK_ICONS[icon.trim()]) || ArrowRight;
  return <Icon className="mt-0.5 h-5 w-5 shrink-0 text-maroon-700 dark:text-maroon-300" aria-hidden="true" />;
}

const GET_INVOLVED_LINKS = [
  { href: '/join', label: 'Join the club' },
  { href: '/volunteer', label: 'Volunteer' },
  { href: '/pot-club', label: 'Pot Club' },
  { href: '/merchandise', label: 'Shop' },
  { href: '/contact', label: 'Contact the club' },
];

const GET_INVOLVED_ICONS: Record<string, LucideIcon> = { '/join': Users, '/volunteer': HandHeart, '/pot-club': Coins, '/merchandise': ShoppingBag, '/contact': Mail };

function JuniorVoucherBlock({ vouchers: VOUCHERS }: { vouchers: JuniorGetActiveVouchers | null }) {
  if (!VOUCHERS) return null;
  return (
    <div id={VOUCHERS.anchorId} className="scroll-mt-40 border-l-4 border-sky_accent bg-surface-blue-subtle px-5 py-4">
      <p className="text-sm font-semibold text-content-blue">Support for junior families</p>
      <h3 className="font-display text-xl font-semibold text-content-primary">Get Active Kids vouchers</h3>
      <p className="mt-1 text-base leading-relaxed text-content-blue">
        Eligible Victorian children aged 0 to 18 may receive <strong>up to $200 each</strong> towards sport membership and registration fees.
      </p>
      <details className="mt-2 text-sm leading-relaxed text-content-blue">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold underline underline-offset-4">Dates, eligibility and reimbursement</summary>
        <p className="mt-1"><strong>{VOUCHERS.roundLabel}:</strong> {VOUCHERS.startLabel} to <time dateTime={VOUCHERS.endsAt}>{VOUCHERS.endLabel}</time> (Victorian time), or earlier if funding runs out. Cricket Victoria advises this is the only round this season.</p>
        <p className="mt-2">Applying for cricket? Select <strong>Cricket Victoria</strong> as your activity provider. Check the official website for eligibility and current availability.</p>
        <p className="mt-2">Already paid? You may be eligible for reimbursement. See the official application page for details.</p>
      </details>
      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1">
        <a href={VOUCHERS.eligibilityUrl} className="btn-primary">Check eligibility and apply</a>
        <a href={VOUCHERS.applicationDetailsUrl} className="club-text-link text-sm font-semibold">Voucher and reimbursement details</a>
        <Link href="/contact" className="club-text-link text-sm font-semibold">Ask NDCC about junior cricket</Link>
      </div>
    </div>
  );
}

type QuickLink = { id: string; href: string; title: string; description?: string | null; icon?: string | null };

function GetInvolvedView({ title, intro, quickLinks, quickLinksTitle, vouchers, cookieDough }: { title: string; intro: string | null; quickLinks: QuickLink[]; quickLinksTitle: string; vouchers: JuniorGetActiveVouchers | null; cookieDough: CookieDoughCampaign | null }) {
  const fixedHrefs = new Set(GET_INVOLVED_LINKS.map((link) => link.href));
  const extraLinks = quickLinks.filter((link) => !fixedHrefs.has(link.href));
  const hasPromotions = Boolean(vouchers || cookieDough);
  return (
    <section className="bg-surface-page py-14 sm:py-20" aria-labelledby="get-involved-title">
      <div className="container-width px-4 sm:px-6 lg:px-8">
        <SectionHeading id="get-involved-title" title={title} />
        {intro && <p className="-mt-2 mb-4 max-w-2xl text-base text-content-secondary">{intro}</p>}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" data-reveal-stagger="">
          {GET_INVOLVED_LINKS.map((link) => {
            const Icon = GET_INVOLVED_ICONS[link.href] || ArrowRight;
            return (
              <li key={link.href}>
                <Link href={link.href} className="group card card-interactive involve-tile focus-ring">
                  <span className="involve-icon"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1 font-display text-lg font-semibold tracking-[-0.02em] text-content-primary">{link.label}</span>
                  <ArrowRight className="h-4 w-4 flex-none text-content-muted transition-colors group-hover:text-maroon-700 dark:group-hover:text-sky_accent" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
        {hasPromotions && (
          <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
            <JuniorVoucherBlock vouchers={vouchers} />
            {cookieDough && <CookieDoughFundraiserFeature campaign={cookieDough} />}
          </div>
        )}
        {extraLinks.length > 0 && (
          <div className="mt-8">
            <h3 className="mb-2 font-display text-lg font-semibold text-content-primary">{quickLinksTitle}</h3>
            <ul className="grid border-t border-edge-subtle sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-3">
              {extraLinks.map((link) => (
                <li key={link.id} className="border-b border-edge-subtle">
                  <Link href={link.href} className="group flex min-h-11 items-start gap-3 py-3 focus-ring">
                    <QuickLinkIcon icon={link.icon} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-content-primary group-hover:underline">{link.title}</span>
                      {link.description && <span className="block text-sm text-content-muted">{link.description}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

const GET_INVOLVED_DEFAULT_TITLE = 'Get involved';
const QUICK_LINKS_DEFAULT_TITLE = 'Around the club';

async function GetInvolvedSection() {
  const [blocks, quickLinks, vouchers, cookieDough] = await Promise.all([
    getHomeBlocks(),
    getPageLinkCards('home', 'quick_links'),
    getJuniorGetActiveVouchers().catch(() => null),
    getCookieDoughCampaign().catch(() => null),
  ]);
  return (
    <GetInvolvedView
      title={cmsCopy(blocks['home.juniors']?.title) || GET_INVOLVED_DEFAULT_TITLE}
      intro={cmsCopy(blocks['home.juniors']?.body)}
      quickLinks={quickLinks}
      quickLinksTitle={cmsCopy(blocks['home.quicklinks']?.title) || QUICK_LINKS_DEFAULT_TITLE}
      vouchers={vouchers}
      cookieDough={cookieDough}
    />
  );
}

// ---------------------------------------------------------------------------
// Partners.

function SponsorLinks() {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Link href="/sponsors" className="btn-secondary">
        View all sponsors
      </Link>
      <Link href="/sponsors#enquiry-form" className="btn-primary">
        Become a sponsor
      </Link>
    </div>
  );
}

function SponsorsSkeleton() {
  return (
    <section className="border-y border-edge-subtle bg-surface-card py-14 sm:py-20" aria-labelledby="partners-title">
      <div className="container-width px-4 sm:px-6 lg:px-8">
        <SectionHeading id="partners-title" title="Our Sponsors" />
        <div className="flex gap-4 overflow-hidden">
          {[0, 1, 2].map((index) => <div key={index} className="h-32 w-60 flex-none animate-pulse rounded-2xl bg-surface-muted" />)}
        </div>
        <SponsorLinks />
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
  const sponsorshipBody = cmsCopy(sponsorBlock?.body);

  return (
    <section className="border-y border-edge-subtle bg-surface-card py-14 sm:py-20" aria-labelledby="partners-title">
      <div className="container-width px-4 sm:px-6 lg:px-8">
        <SectionHeading id="partners-title" title={sponsorshipTitle} />
        {sponsorshipBody && <p className="-mt-2 mb-4 max-w-2xl text-base text-content-secondary">{sponsorshipBody}</p>}
        <SponsorsMarquee
          sponsors={sponsors}
          durationSeconds={sponsorMarqueeDurationSeconds(clubSettings.sponsor_marquee_speed, sponsors.length)}
          showViewAll={false}
        />
        <SponsorLinks />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Toggle-gated rows: season appointments (club season toggle) and Dino Coach
// (public launch setting).

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

async function FantasyTeaserSection() {
  if (!(await isDinoCoachPublic())) return null;
  // Static teaser: copy describes the game itself (same wording as the
  // /fantasy page), so nothing here can go stale or invent scores.
  return (
    <section className="bg-surface-page py-8" aria-labelledby="dino-coach-title">
      <div className="container-width px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 border-y border-edge-strong py-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h2 id="dino-coach-title" className="font-display text-2xl font-semibold text-content-primary">Dino Coach</h2>
            <p className="mt-1 text-base leading-relaxed text-content-secondary">
              Build your 15-player NDCC squad with Dino Dollars, captain your stars and score points from real match performances.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/fantasy" className="btn-primary">Play Dino Coach</Link>
            <Link href="/fantasy/leaderboard" className="btn-secondary">View Leaderboard</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Gallery strip.

async function GalleryPreviewSection() {
  const { data: photos } = await getPublicGallery();
  const preview = photos.slice(0, 4);
  if (preview.length === 0) return null;

  return (
    <section className="bg-surface-card py-14 sm:py-20" aria-labelledby="gallery-title">
      <div className="container-width px-4 sm:px-6 lg:px-8">
        <SectionHeading id="gallery-title" title="Gallery">
          <Link href="/gallery" className={headingLinkClass}>View full gallery</Link>
        </SectionHeading>
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {preview.map((photo) => (
            <li key={photo.id} className="relative aspect-video min-w-0 overflow-hidden rounded-xl bg-surface-page">
              <SafeImage
                src={photo.image_url}
                alt={photo.alt_text || photo.caption || photo.title}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 50vw, 25vw"
                fallback={<div className="absolute inset-0 bg-surface-muted" aria-hidden="true" />}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
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
            ctaUrl="/join"
          />
        }
      >
        <HeroSection />
      </Suspense>

      {/* Match-day board (hidden without PlayHQ data) and season status. */}
      <Suspense
        fallback={
          <FixturesView
            statusTitle="Season Update"
            statusBody={SEASON_STATUS_DEFAULT_BODY}
            ctaLabel="View Results on PlayHQ"
            ctaUrl={PLAYHQ_ORG_URL}
          />
        }
      >
        <FixturesSection />
      </Suspense>

      <Suspense fallback={null}>
        <ThisWeekSection />
      </Suspense>

      <Suspense fallback={<ClubNewsSkeleton />}>
        <ClubUpdatesSection />
      </Suspense>

      <Suspense
        fallback={
          <GetInvolvedView title={GET_INVOLVED_DEFAULT_TITLE} intro={null} quickLinks={[]} quickLinksTitle={QUICK_LINKS_DEFAULT_TITLE} vouchers={null} cookieDough={null} />
        }
      >
        <GetInvolvedSection />
      </Suspense>

      <Suspense fallback={<SponsorsSkeleton />}>
        <SponsorsSection />
      </Suspense>

      {/* Toggle-gated rows follow the core fixtures, news, events and sponsors. */}
      <Suspense fallback={null}>
        <SeasonAppointmentsSection />
      </Suspense>

      <Suspense fallback={null}>
        <FantasyTeaserSection />
      </Suspense>

      <Suspense fallback={null}>
        <GalleryPreviewSection />
      </Suspense>
    </>
  );
}
