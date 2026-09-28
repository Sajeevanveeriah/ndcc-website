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
import { ArrowRight, CalendarDays, Camera, Clock, Coins, ExternalLink, HandHeart, Info, Mail, MapPin, Newspaper, ShoppingBag, Ticket, Trophy, Users } from 'lucide-react';
import {
  CLUB_NAME,
  CLUB_NICKNAME,
  CLUB_ESTABLISHED,
  CLUB_ASSOCIATION,
  PLAYHQ_ORG_URL,
  FACEBOOK_URL,
} from '@/lib/constants';
import { formatCurrency, formatDate, truncateText } from '@/lib/utils';
import { getContentBlocks } from '@/lib/content-blocks';
import { getPublishedNews, type PublicNewsRecord } from '@/lib/public-news';
import { getPublicSeasonAppointments, type PublicSeasonAppointment } from '@/lib/public-season-appointments';
import ClubIntro from '@/components/home/ClubIntro';
import CricketBall, { StumpsIcon } from '@/components/home/CricketBall';
import SeasonAppointmentsMarquee from '@/components/home/SeasonAppointmentsMarquee';
import HomeStatsStrip from '@/components/home/HomeStatsStrip';
import { getPageLinkCards } from '@/lib/structured-content';
import SponsorsMarquee from '@/components/home/SponsorsMarquee';
import { getPublishedPublications, publicationTypeLabel } from '@/lib/public-publications';
import { getPublicEvents, getPublicGallery, getPublicSponsors } from '@/lib/public-data';
import { getUpcomingCalendarEvents } from '@/lib/calendar/queries';
import { CALENDAR_EVENT_TYPE_LABELS } from '@/lib/calendar/types';
import { getClubSettings } from '@/lib/club-settings';
import { createServerClient } from '@/lib/supabase-server';
import { getCurrentClubSeason } from '@/lib/club-seasons';
import { renderSeasonContent } from '@/lib/season-content';
import { sponsorMarqueeDurationSeconds } from '@/lib/sponsor-marquee';
import { isDinoCoachPublic } from '@/lib/dino-coach/public-visibility';
import { getPlayHQPublicData } from '@/lib/playhq/client';
import { shortTeamLabel, teamMatchKey, teamsAwaitingPlayHQ } from '@/lib/playhq/team-view';
import { groupByCategory, juniorAge, teamCategory } from '@/lib/playhq/team-category';
import { getPublicTeamsWithSlugs } from '@/lib/public-teams';
import CookieDoughFundraiserFeature from '@/components/home/CookieDoughFundraiserFeature';
import { getJuniorGetActiveVouchers, type JuniorGetActiveVouchers } from '@/lib/home-promotions';
import { getCookieDoughCampaign, type CookieDoughCampaign } from '@/lib/server/site-promotions';
import {
  comingUpDateParts,
  formatClubTime,
  formatEventDay,
  formatMatchDayDate,
  mergeComingUp,
  selectMatchDayBoard,
  selectNextEvent,
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
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-1" data-reveal="">
      <span aria-hidden="true" className="basis-full"><span className="brand-rule !mb-3" /></span>
      <h2 id={id} className="font-display text-2xl font-semibold tracking-[-0.03em] text-content-primary sm:text-3xl">{title}</h2>
      {children && <div className="flex flex-wrap gap-x-6">{children}</div>}
    </div>
  );
}

// Smaller heading for the side-column previews: title plus a "View all" link.
function PreviewHeading({ id, title, href, linkLabel }: { id: string; title: string; href: string; linkLabel: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-4">
      <h2 id={id} className="font-display text-xl font-semibold tracking-[-0.02em] text-content-primary">{title}</h2>
      <Link href={href} className="club-text-link shrink-0 text-sm font-semibold">View all<span className="sr-only"> {linkLabel}</span></Link>
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

// ---------------------------------------------------------------------------
// Opening section: smaller dinosaur intro and title beside the next event.

function HeroView({
  title,
  body,
  ctaLabel,
  ctaUrl,
  season = null,
  stats = null,
  vouchers = null,
  nextEvent,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  season?: string | null;
  stats?: ReactNode;
  vouchers?: JuniorGetActiveVouchers | null;
  nextEvent: ReactNode;
}) {
  return (
    <section className="club-home-hero" aria-labelledby="home-title">
      <CricketBall className="cricket-ball-hero" />
      <div className="container-width grid gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:items-center lg:gap-10 lg:px-8 lg:py-10">
        <div className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-center gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-x-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-x-8">
          <div className="relative w-full sm:row-span-2">
            <div aria-hidden="true" className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-maroon-700/20 via-sky_accent/20 to-gold-400/25 blur-2xl dark:from-maroon-600/35 dark:via-sky_accent/10 dark:to-gold-400/15" />
            <ClubIntro />
          </div>
          <div className="club-home-copy sm:self-end">
            <p className="club-kicker"><StumpsIcon className="mr-2.5 inline-block h-3.5 w-3 -translate-y-px align-middle text-gold-400" />Est. {CLUB_ESTABLISHED} <span aria-hidden="true"> / </span> {CLUB_ASSOCIATION}</p>
            <h1 id="home-title" className="club-home-title">{title}</h1>
            <p className="mt-1.5 font-display text-lg font-semibold tracking-[-0.02em] sm:text-2xl"><span className="text-brand-gradient">Home of the {CLUB_NICKNAME}.</span></p>
            {season && <p className="mt-0.5 text-sm text-content-muted">{season}</p>}
          </div>
          {/* Full width under the intro on phones, under the title from sm up. */}
          <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:self-start">
            {body && !/^Home of the (Mighty )?Dinos/i.test(body) && <p className="mb-3 max-w-xl text-base leading-relaxed text-content-secondary">{body}</p>}
            <div className="flex flex-wrap gap-3">
              <Link href={ctaUrl} className="btn-primary">{ctaLabel}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              <Link href="/fixtures" className="btn-secondary">View Fixtures</Link>
            </div>
            {vouchers && (
              <p className="mt-1 text-base font-semibold">
                <a href={`#${vouchers.anchorId}`} className="club-text-link">{vouchers.heroLinkLabel}</a>
              </p>
            )}
            {stats}
          </div>
        </div>
        {nextEvent}
      </div>
    </section>
  );
}

// Published events and home calendar entries, read once per render and shared
// by the hero and "Coming up".
const getHomeEvents = cache(() => getPublicEvents());
const getHomeCalendar = cache(() => getUpcomingCalendarEvents({ limit: 6, home: true }));

function NextEventSkeleton() {
  return (
    <aside className="next-event-card" aria-labelledby="next-event-title" aria-busy="true">
      <p className="club-kicker">Next event</p>
      <h2 id="next-event-title" className="sr-only">Next event</h2>
      <div className="mt-3 h-7 w-2/3 animate-pulse rounded bg-surface-muted" />
      <div className="mt-3 space-y-2">{[0, 1, 2].map((index) => <div key={index} className="h-5 w-1/2 animate-pulse rounded bg-surface-muted" />)}</div>
    </aside>
  );
}

// Status of the calendar entries linked to one event (read directly, not
// from the capped "Coming up" list). Null when none is cancelled or
// postponed, or when the read fails.
async function linkedCalendarStatus(eventId: string): Promise<'cancelled' | 'postponed' | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const { data, error } = await createServerClient({ publicReadCache: true, fetchTimeoutMs: 8_000 })
      .from('calendar_events').select('status').eq('source_event_id', eventId);
    if (error || !Array.isArray(data)) return null;
    const statuses = data.map((row) => (row as { status?: unknown }).status);
    return statuses.includes('cancelled') ? 'cancelled' : statuses.includes('postponed') ? 'postponed' : null;
  } catch {
    return null;
  }
}

function EventFact({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <dt><Icon className="mt-0.5 h-4 w-4 text-maroon-700 dark:text-sky_accent" aria-hidden="true" /><span className="sr-only">{label}</span></dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

async function NextEventSection() {
  const { data: events, degraded } = await getHomeEvents();
  const event = selectNextEvent(events, Date.now());
  if (!event && degraded) {
    return (
      <aside className="next-event-card" aria-labelledby="next-event-title">
        <p className="club-kicker">Next event</p>
        <h2 id="next-event-title" className="mt-2 font-display text-xl font-semibold text-content-primary">Events could not be loaded right now</h2>
        <p className="mt-2 text-base text-content-secondary">Please try again shortly, or check the events page and club calendar.</p>
        <div className="mt-3 flex flex-wrap gap-x-6">
          <Link href="/events" className="club-text-link text-sm font-semibold">All events</Link>
          <Link href="/calendar" className="club-text-link text-sm font-semibold">Club calendar</Link>
        </div>
      </aside>
    );
  }
  if (!event) {
    return (
      <aside className="next-event-card" aria-labelledby="next-event-title">
        <p className="club-kicker">Next event</p>
        <h2 id="next-event-title" className="mt-2 font-display text-xl font-semibold text-content-primary">No upcoming event is published yet</h2>
        <p className="mt-2 text-base text-content-secondary">New club events are added to the events page and club calendar.</p>
        <div className="mt-3 flex flex-wrap gap-x-6">
          <Link href="/events" className="club-text-link text-sm font-semibold">All events</Link>
          <Link href="/calendar" className="club-text-link text-sm font-semibold">Club calendar</Link>
        </div>
      </aside>
    );
  }
  const day = formatEventDay(event.date);
  const time = formatClubTime(event.date);
  const venue = event.location?.trim();
  const price = Number(event.ticket_price);
  const songs = event.registration_mode === 'song_requests';
  // A cancellation or postponement recorded on the event's own calendar
  // entries wins, so the hero never keeps advertising booking for it.
  const status = await linkedCalendarStatus(event.id);
  return (
    <aside className="next-event-card" aria-labelledby="next-event-title">
      <p className="club-kicker">Next event{status && <span className="ml-2 rounded-full bg-maroon-700 px-2 py-0.5 text-white dark:bg-maroon-300 dark:text-maroon-950">{status === 'cancelled' ? 'Cancelled' : 'Postponed'}</span>}</p>
      <h2 id="next-event-title" className={`mt-2 font-display text-2xl font-semibold tracking-[-0.02em] text-content-primary sm:text-3xl ${status === 'cancelled' ? 'line-through' : ''}`}>{event.title}</h2>
      <dl className="mt-3 space-y-1.5 text-base text-content-secondary">
        {day && <EventFact icon={CalendarDays} label="Date"><time dateTime={event.date}>{day}</time></EventFact>}
        <EventFact icon={Clock} label="Time">{time || 'Time to be confirmed'}</EventFact>
        {venue && <EventFact icon={MapPin} label="Venue">{venue}</EventFact>}
        {Number.isFinite(price) && <EventFact icon={Ticket} label="Price">{price > 0 ? `${formatCurrency(price)}${songs ? ' per song' : ''}` : 'Free entry'}</EventFact>}
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1">
        {status === 'cancelled' ? (
          <Link href="/calendar" className="btn-secondary">Check the club calendar</Link>
        ) : (
          <Link href={`/events/${event.id}`} className="btn-primary">
            {status === 'postponed' ? 'Event details' : songs ? 'Details and song requests' : 'Details and booking'}<span className="sr-only">: {event.title}</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
        <Link href="/events" className="club-text-link text-sm font-semibold">All events</Link>
      </div>
    </aside>
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
      nextEvent={<Suspense fallback={<NextEventSkeleton />}><NextEventSection /></Suspense>}
    />
  );
}

// ---------------------------------------------------------------------------
// Next matches: men's, women's and junior teams from PlayHQ, plus website
// teams PlayHQ does not list yet, and the CMS season status line.

type BoardRow = MatchDayEntry | { state: 'awaiting'; teamId: string; teamName: string; gradeName: string | null; fixture: null; href: string };
type HomeMatchDay = { board: BoardRow[]; clubPlayHQUrl: string } | null;

// One PlayHQ read per render. Null (the section says fixtures could not be
// loaded) when PlayHQ is not configured or errored.
const getHomeMatchDay = cache(async (): Promise<HomeMatchDay> => {
  const [playhq, settings, cmsTeams] = await Promise.all([
    getPlayHQPublicData().catch((error) => {
      console.warn('[home] PlayHQ data temporarily unavailable:', error instanceof Error ? error.message : 'unknown');
      return null;
    }),
    getClubSettings(),
    getPublicTeamsWithSlugs().catch(() => []),
  ]);
  if (!playhq || !playhq.configured || playhq.error) return null;
  const board: BoardRow[] = selectMatchDayBoard(playhq.teams, playhq.fixtures, Date.now(), unavailableGradesFromWarnings(playhq.warnings));
  for (const team of teamsAwaitingPlayHQ(cmsTeams, playhq.teams)) {
    board.push({ state: 'awaiting', teamId: `cms-${team.id || team.slug}`, teamName: team.name.trim(), gradeName: team.grade?.trim() || null, fixture: null, href: `/teams/${team.slug}` });
  }
  if (board.length === 0) return null;
  return { board, clubPlayHQUrl: settings.playhq_url || PLAYHQ_ORG_URL };
});

const SEASON_STATUS_DEFAULT_BODY = 'Match-day notices and club announcements are posted on our';

function ExternalLinkIcon() {
  return <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

// Within each category: by ordinal (1sts, 2nds ...) or junior age group
// (U11, U13 ...), then by name.
function sortBoardRows(rows: BoardRow[]) {
  const rank = (row: BoardRow) => teamMatchKey(row.teamName).ordinal ?? juniorAge(row.teamName) ?? 99;
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.teamName.localeCompare(b.teamName));
}

function MatchRow({ row, clubPlayHQUrl }: { row: BoardRow; clubPlayHQUrl: string }) {
  const label = row.state === 'awaiting' ? row.teamName : shortTeamLabel(row.teamName);
  const grade = row.gradeName && row.gradeName !== row.teamName ? row.gradeName : null;
  const fixture = row.fixture;
  const team = (
    <p className="min-w-0 font-display text-lg font-semibold leading-snug tracking-[-0.01em] text-content-primary">
      {row.state === 'awaiting' ? <Link href={row.href} className="hover:underline">{label}</Link> : label}
      {grade && <span className="ml-2 font-body text-sm font-normal tracking-normal text-content-muted sm:ml-0 sm:block">{grade}</span>}
    </p>
  );
  if (!fixture) {
    return (
      <li className="grid gap-0.5 px-4 py-2.5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center sm:gap-4 sm:py-3">
        {team}
        <p className="text-sm text-content-muted">
          {row.state === 'unavailable' ? (
            <>Fixture details could not be loaded here.{' '}
              <a href={clubPlayHQUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-maroon-700 underline underline-offset-4 dark:text-sky_accent">Check PlayHQ<span className="sr-only"> for {row.teamName}</span></a>
            </>
          ) : row.state === 'awaiting' ? 'Fixture not yet published by GCA on PlayHQ' : 'Fixture not yet released by GCA'}
        </p>
      </li>
    );
  }
  const home = fixture.homeAway === 'Home';
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      {team}
      <div className="col-span-2 row-start-2 min-w-0 text-base sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <p className="text-content-secondary">
          <span className="text-content-muted">v</span> <span className="font-semibold text-content-primary">{fixture.opponent}</span>{' '}
          <span className={`${home ? 'badge-home' : 'badge-away'} ml-1 align-middle`}>{fixture.homeAway}</span>
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-content-muted">
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{fixture.startsAt ? <time dateTime={fixture.startsAt}>{formatMatchDayDate(fixture.startsAt)}</time> : 'Date TBC'}</span>
          {fixture.venue && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{fixture.venue}</span>}
        </p>
      </div>
      <a href={fixture.playHQUrl || clubPlayHQUrl} target="_blank" rel="noopener noreferrer" className="club-text-link col-start-2 row-start-1 gap-1.5 justify-self-end text-sm font-semibold sm:col-start-3">
        PlayHQ<span className="sr-only">: {row.teamName} v {fixture.opponent} (opens in a new tab)</span>
        <ExternalLinkIcon />
      </a>
    </li>
  );
}

function FixturesView({
  statusTitle,
  statusBody,
  ctaLabel,
  ctaUrl,
  matchDay = null,
  loading = false,
}: {
  statusTitle: string;
  statusBody: string;
  ctaLabel: string;
  ctaUrl: string;
  matchDay?: HomeMatchDay;
  loading?: boolean;
}) {
  const groups = matchDay ? groupByCategory(matchDay.board, (row) => teamCategory(row.teamName, row.gradeName)).filter((group) => group.items.length > 0) : [];
  return (
    <section aria-labelledby="home-fixtures-title">
      <SectionHeading id="home-fixtures-title" title="Next matches">
        <Link href="/fixtures" className={headingLinkClass}>All fixtures and results</Link>
      </SectionHeading>
      {loading ? (
        <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3].map((index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-surface-muted" />)}</div>
      ) : groups.length > 0 && matchDay ? (
        <div className="space-y-4" data-reveal-stagger="">
          {groups.map((group) => (
            <div key={group.category}>
              <h3 id={`home-matches-${group.category}`} className="mb-1.5 text-sm font-semibold uppercase tracking-[0.12em] text-maroon-700 dark:text-sky_accent">{group.label}</h3>
              <ul aria-labelledby={`home-matches-${group.category}`} className="divide-y divide-edge-subtle overflow-hidden rounded-2xl border border-edge-subtle bg-surface-card dark:divide-white/10 dark:border-white/10 dark:bg-white/[0.035]">
                {sortBoardRows(group.items).map((row) => <MatchRow key={row.teamId} row={row} clubPlayHQUrl={matchDay.clubPlayHQUrl} />)}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-edge-subtle bg-surface-card px-4 py-3 text-base text-content-secondary">
          Next matches could not be loaded here right now.{' '}
          <a href={ctaUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-maroon-700 underline underline-offset-4 dark:text-sky_accent">Check fixtures on PlayHQ</a>.
        </p>
      )}
      <div className="mt-4 flex flex-col gap-3 border-t border-edge-subtle pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
        <p className="text-sm leading-relaxed text-content-secondary">
          <span className="font-semibold text-content-primary">{statusTitle}.</span>{' '}
          {statusBody}{' '}
          <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-maroon-700 underline underline-offset-4 dark:text-sky_accent">
            Facebook page
          </a>.
        </p>
        <a href={ctaUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
          {ctaLabel}
          <ExternalLinkIcon />
        </a>
      </div>
    </section>
  );
}

async function FixturesSection() {
  const [blocks, currentSeason, matchDay] = await Promise.all([getHomeBlocks(), getHomeSeason(), getHomeMatchDay()]);
  const block = blocks['home.season_status'];
  return (
    <FixturesView
      statusTitle={renderSeasonContent(block?.title || 'Season Update', currentSeason).replace(/[.\s]+$/, '')}
      statusBody={renderSeasonContent(block?.body || SEASON_STATUS_DEFAULT_BODY, currentSeason)}
      ctaLabel={renderSeasonContent(block?.cta_label || 'View Results on PlayHQ', currentSeason)}
      ctaUrl={block?.cta_url || PLAYHQ_ORG_URL}
      matchDay={matchDay}
    />
  );
}

// ---------------------------------------------------------------------------
// Side column: short "Coming up" and "Club news" previews. Fixtures are left
// to Next matches and the hero's next event is not repeated here.

const COMING_UP_KIND_LABEL: Record<ComingUpItem['kind'], string> = { fixture: 'Fixture', event: 'Club event', calendar: 'Calendar' };
const COMING_UP_PREVIEW_LIMIT = 4;

function ComingUpRow({ item, kindLabel }: { item: ComingUpItem; kindLabel: string }) {
  const parts = comingUpDateParts(item.startsAt);
  const cancelled = item.status === 'cancelled';
  const content = (
    <>
      <span className="date-tile !h-12 !w-12 !rounded-xl">
        {parts && (
          <>
            <span className="text-[0.7rem] font-semibold uppercase leading-none tracking-wide text-maroon-700 dark:text-sky_accent">{parts.weekday}</span>
            <span className="font-display text-lg font-semibold leading-tight text-content-primary">{parts.day}</span>
            <span className="text-[0.7rem] leading-none text-content-muted">{parts.month}</span>
          </>
        )}
      </span>
      <span className="min-w-0">
        <span className={`block font-semibold leading-snug text-content-primary group-hover:underline ${cancelled ? 'line-through' : ''}`}>{item.title}</span>
        <span className="block text-sm text-content-muted">
          {kindLabel}
          {item.status && <span className="ml-1.5 font-semibold text-maroon-700 dark:text-maroon-300">{cancelled ? 'Cancelled' : 'Postponed'}</span>}
          {item.detail && <>, {item.detail}</>}
        </span>
      </span>
    </>
  );
  const rowClass = 'group grid min-h-11 grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 py-2.5 focus-ring';
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

function PreviewPanel({ id, children }: { id: string; children: ReactNode }) {
  return <section aria-labelledby={id} className="rounded-2xl border border-edge-subtle bg-surface-card px-4 py-4 dark:border-white/10 dark:bg-white/[0.035]">{children}</section>;
}

function PreviewSkeleton({ id, title, href }: { id: string; title: string; href: string }) {
  return (
    <PreviewPanel id={id}>
      <PreviewHeading id={id} title={title} href={href} linkLabel={title.toLowerCase()} />
      <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((index) => <div key={index} className="h-11 animate-pulse rounded bg-surface-muted" />)}</div>
    </PreviewPanel>
  );
}

async function ComingUpPreview() {
  const now = Date.now();
  const [{ data: events }, calendarResult] = await Promise.all([
    getHomeEvents(),
    getHomeCalendar(),
  ]);
  const featured = selectNextEvent(events, now);

  const eventItems: ComingUpItem[] = events
    .filter((event) => {
      const time = Date.parse(String(event.date || ''));
      return Number.isFinite(time) && time >= now - 24 * 60 * 60 * 1000;
    })
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .slice(0, 3)
    .map((event) => ({
      key: `event-${event.id}`,
      sourceEventId: event.id,
      kind: 'event' as const,
      startsAt: event.date,
      title: event.title,
      detail: [formatClubTime(event.date), event.location?.trim()].filter(Boolean).join(', ') || null,
      href: `/events/${event.id}`,
      external: false,
      status: null,
    }));

  const calendarRows = calendarResult.degraded ? [] : calendarResult.data;
  const calendarItems: ComingUpItem[] = calendarRows.map((event) => {
    const cancelled = event.status === 'cancelled';
    const target = cancelled ? null : event.cta_url || event.external_url;
    return {
      key: `calendar-${event.id}`,
      sourceEventId: event.source_event_id,
      kind: 'calendar' as const,
      startsAt: event.start_at,
      title: event.title,
      detail: [event.all_day ? 'All day' : formatClubTime(event.start_at), event.location?.trim()].filter(Boolean).join(', ') || null,
      href: target || '/calendar',
      external: Boolean(target && /^https?:\/\//.test(target)),
      status: event.status === 'cancelled' || event.status === 'postponed' ? event.status : null,
    };
  });
  const calendarTypeLabels = new Map(calendarRows.map((event) => [
    `calendar-${event.id}`,
    CALENDAR_EVENT_TYPE_LABELS[event.event_type] ?? COMING_UP_KIND_LABEL.calendar,
  ]));

  const items = mergeComingUp([...eventItems, ...calendarItems])
    .filter((item) => !featured || item.sourceEventId !== featured.id)
    .slice(0, COMING_UP_PREVIEW_LIMIT);

  return (
    <PreviewPanel id="this-week-title">
      <PreviewHeading id="this-week-title" title="Coming up" href="/calendar" linkLabel="dates in the club calendar" />
      {items.length > 0 ? (
        <ul className="divide-y divide-edge-subtle dark:divide-white/10">
          {items.map((item) => <ComingUpRow key={item.key} item={item} kindLabel={calendarTypeLabels.get(item.key) ?? COMING_UP_KIND_LABEL[item.kind]} />)}
        </ul>
      ) : (
        <p className="py-2 text-sm text-content-muted">Nothing else is scheduled yet. <Link href="/events" className="underline">See all events</Link>.</p>
      )}
    </PreviewPanel>
  );
}

const NEWS_PREVIEW_LIMIT = 3;

async function ClubNewsPreview() {
  const [blocks, news, publications] = await Promise.all([
    getHomeBlocks(),
    getLatestNews(),
    getPublishedPublications({ limit: 1 }).catch(() => null),
  ]);
  const [lead, ...rest] = news.slice(0, NEWS_PREVIEW_LIMIT);
  const publication = publications?.[0] ?? null;

  return (
    <PreviewPanel id="club-news-title">
      <PreviewHeading id="club-news-title" title={cmsCopy(blocks['home.welcome']?.title) || 'Club news'} href="/news" linkLabel="club news" />
      {cmsCopy(blocks['home.welcome']?.body) && <p className="mb-1 line-clamp-3 text-sm text-content-secondary">{cmsCopy(blocks['home.welcome']?.body)}</p>}
      {lead ? (
        <ul className="divide-y divide-edge-subtle dark:divide-white/10">
          <li>
            <Link href={`/news/${lead.id}`} className="group grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 py-2.5 focus-ring">
              <span className="relative block aspect-square overflow-hidden rounded-lg bg-surface-page">
                <SafeImage
                  src={lead.image_url || lead.image || '/images/Womens_Team.jpg'}
                  alt={lead.title}
                  fill
                  className="object-cover"
                  sizes="72px"
                  fallback={<span className="absolute inset-0 bg-maroon-800" aria-hidden="true" />}
                />
              </span>
              <span className="min-w-0">
                {lead.published_at && <span className="block text-sm text-content-muted"><time dateTime={lead.published_at}>{formatDate(lead.published_at)}</time></span>}
                <span className="block font-semibold leading-snug text-content-primary group-hover:underline">{lead.title}</span>
                <span className="mt-0.5 line-clamp-2 text-sm text-content-secondary">{truncateText(lead.content, 120)}</span>
              </span>
            </Link>
          </li>
          {rest.map((article) => (
            <li key={article.id}>
              <Link href={`/news/${article.id}`} className="group block min-h-11 py-2.5 focus-ring">
                {article.published_at && <span className="block text-sm text-content-muted">{formatDate(article.published_at)}</span>}
                <span className="block font-semibold leading-snug text-content-primary group-hover:underline">{article.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2 text-sm text-content-muted">
          News is temporarily unavailable. <Link href="/news" className="underline">Try the news page</Link> or visit our <a href={FACEBOOK_URL} className="underline">Facebook page</a>.
        </p>
      )}
      {publication && (
        <Link href={`/publications/${publication.slug}`} className="group mt-1 block min-h-11 border-t border-edge-subtle pt-2.5 focus-ring dark:border-white/10">
          <span className="block text-sm text-content-muted">Latest publication: {publicationTypeLabel(publication.publication_type)}, {formatDate(publication.issue_date)}</span>
          <span className="block font-semibold leading-snug text-content-primary group-hover:underline">{publication.title}</span>
        </Link>
      )}
      {publications === null && (
        <p className="mt-1 text-sm text-content-muted">Publications are temporarily unavailable. <Link href="/publications" className="underline">Try again</Link>.</p>
      )}
    </PreviewPanel>
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
    <section className="border-t border-edge-subtle bg-surface-page py-8 sm:py-10" aria-labelledby="get-involved-title">
      <div className="container-width px-4 sm:px-6 lg:px-8">
        <SectionHeading id="get-involved-title" title={title} />
        {intro && <p className="-mt-2 mb-4 max-w-2xl text-base text-content-secondary">{intro}</p>}
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5 [&>li:last-child]:col-span-2 sm:[&>li:last-child]:col-span-1" data-reveal-stagger="">
          {GET_INVOLVED_LINKS.map((link) => {
            const Icon = GET_INVOLVED_ICONS[link.href] || ArrowRight;
            return (
              <li key={link.href}>
                <Link href={link.href} className="group card card-interactive involve-tile !min-h-0 !gap-3 !p-3.5 focus-ring">
                  <span className="involve-icon"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1 font-display text-base font-semibold tracking-[-0.01em] text-content-primary">{link.label}</span>
                  <ArrowRight className="h-4 w-4 flex-none text-content-muted transition-colors group-hover:text-maroon-700 dark:group-hover:text-sky_accent" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
        {hasPromotions && (
          <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
            <JuniorVoucherBlock vouchers={vouchers} />
            {cookieDough && <CookieDoughFundraiserFeature campaign={cookieDough} />}
          </div>
        )}
        {extraLinks.length > 0 && (
          <div className="mt-5">
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
    <section className="border-y border-edge-subtle bg-surface-card py-8 sm:py-10" aria-labelledby="partners-title">
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
    <section className="border-y border-edge-subtle bg-surface-card py-8 sm:py-10" aria-labelledby="partners-title">
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
    <section className="bg-surface-page py-6" aria-labelledby="dino-coach-title">
      <div className="container-width px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 border-y border-edge-strong py-4 md:flex-row md:items-center md:justify-between">
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
    <section className="bg-surface-card py-8 sm:py-10" aria-labelledby="gallery-title">
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
            nextEvent={<NextEventSkeleton />}
          />
        }
      >
        <HeroSection />
      </Suspense>

      {/* Main column: next matches for every team. Side column: short
          "Coming up" and "Club news" previews (stacked below on mobile). */}
      <section className="home-band border-b border-edge-subtle py-8 sm:py-10" aria-label="Matches, dates and news">
        <div className="container-width grid gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10 lg:px-8">
          <div className="min-w-0">
            <Suspense
              fallback={
                <FixturesView
                  statusTitle="Season Update"
                  statusBody={SEASON_STATUS_DEFAULT_BODY}
                  ctaLabel="View Results on PlayHQ"
                  ctaUrl={PLAYHQ_ORG_URL}
                  loading
                />
              }
            >
              <FixturesSection />
            </Suspense>
          </div>
          <div className="min-w-0 space-y-4">
            <Suspense fallback={<PreviewSkeleton id="this-week-title" title="Coming up" href="/calendar" />}>
              <ComingUpPreview />
            </Suspense>
            <Suspense fallback={<PreviewSkeleton id="club-news-title" title="Club news" href="/news" />}>
              <ClubNewsPreview />
            </Suspense>
          </div>
        </div>
      </section>

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
