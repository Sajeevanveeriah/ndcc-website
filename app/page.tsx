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
import LogoChip from '@/components/common/LogoChip';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, CalendarDays, Camera, ExternalLink, HandHeart, Info, Mail, Newspaper, ShoppingBag, Trophy, Users } from 'lucide-react';
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
import NextMatchesTabs from '@/components/home/NextMatchesTabs';
import { getPageLinkCards } from '@/lib/structured-content';
import { getPublishedPublications, publicationTypeLabel } from '@/lib/public-publications';
import { getPublicEvents, getPublicGallery, getPublicSponsors } from '@/lib/public-data';
import { getUpcomingCalendarEvents } from '@/lib/calendar/queries';
import { CALENDAR_EVENT_TYPE_LABELS } from '@/lib/calendar/types';
import { getClubSettings } from '@/lib/club-settings';
import { createServerClient } from '@/lib/supabase-server';
import { getCurrentClubSeason } from '@/lib/club-seasons';
import { renderSeasonContent } from '@/lib/season-content';
import { isDinoCoachPublic } from '@/lib/dino-coach/public-visibility';
import { getPlayHQPublicData } from '@/lib/playhq/client';
import { shortTeamLabel, teamMatchKey, teamsAwaitingPlayHQ } from '@/lib/playhq/team-view';
import { groupByCategory, juniorAge, teamCategory } from '@/lib/playhq/team-category';
import { getPublicTeamsWithSlugs } from '@/lib/public-teams';
import CookieDoughFundraiserFeature from '@/components/home/CookieDoughFundraiserFeature';
import WinnerCard from '@/components/match-day/WinnerCard';
import { getPublishedWinners } from '@/lib/server/match-day';
import { getJuniorGetActiveVouchers, type JuniorGetActiveVouchers } from '@/lib/home-promotions';
import { getCookieDoughCampaign } from '@/lib/server/site-promotions';
import {
  comingUpDateParts,
  formatClubTime,
  formatEventDay,
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

const headingLinkClass = 'nd-link';

// Section heading in the suggested style: small uppercase eyebrow over a
// display heading, with optional text links on the right.
function SectionHeading({ id, eyebrow, title, children }: { id: string; eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="nd-sec-head" data-reveal="">
      <div>
        {eyebrow && <span className="nd-eyebrow mb-1.5">{eyebrow}</span>}
        <h2 id={id}>{title}</h2>
      </div>
      {children && <div className="flex flex-wrap gap-x-5">{children}</div>}
    </div>
  );
}

// Card title with a "View all" link, for the three preview cards.
function PreviewHeading({ id, title, href, linkLabel }: { id: string; title: string; href: string; linkLabel: string }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-4">
      <h2 id={id}>{title}</h2>
      <Link href={href} className="nd-link shrink-0 text-sm">View all<span className="sr-only"> {linkLabel}</span></Link>
    </div>
  );
}

const HERO_DEFAULT_BODY = `Home of the ${CLUB_NICKNAME}. Est. ${CLUB_ESTABLISHED}.`;
// Factual line used when the CMS hero body is unset or only repeats the title
// (same wording as the site description in app/layout.tsx).
const HERO_DEFAULT_LEAD = 'Senior men’s, women’s and junior cricket at Grinter Reserve, Moolap.';

function seasonLine(name: string | null | undefined) {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return /season/i.test(trimmed) ? trimmed : `${trimmed} season`;
}

// ---------------------------------------------------------------------------
// Hero: club name and "Home of the Dinos." on the left; the logo reveal with
// the season tag and the drawn ball on the right.

function HeroView({
  title,
  body,
  ctaLabel,
  ctaUrl,
  season = null,
  stats = null,
  vouchers = null,
  placeholder = false,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  season?: string | null;
  stats?: ReactNode;
  vouchers?: JuniorGetActiveVouchers | null;
  /**
   * Suspense fallback copy. The streamed HeroSection replaces it, but both are
   * in the HTML, so the fallback renders its heading as a styled <p> without
   * the id: the page keeps exactly one home-title heading.
   */
  placeholder?: boolean;
}) {
  const lead = body && !/^Home of the (Mighty )?Dinos/i.test(body) ? body : HERO_DEFAULT_LEAD;
  return (
    <section className="nd-hero" aria-labelledby={placeholder ? undefined : 'home-title'}>
      <div className="nd-wrap nd-hero-grid">
        <div className="min-w-0">
          <p className="nd-eyebrow"><StumpsIcon className="mr-2 inline-block h-3.5 w-3 -translate-y-px align-middle text-gold-400" />Est. {CLUB_ESTABLISHED} <span aria-hidden="true">·</span> {CLUB_ASSOCIATION}</p>
          <p className="mt-3 font-display font-semibold text-content-primary" style={{ fontSize: 'clamp(18px, 1.8vw, 21px)' }}>{title}</p>
          {placeholder
            ? <p className="nd-hero-title">Home of the <span>{CLUB_NICKNAME}.</span></p>
            : <h1 id="home-title" className="nd-hero-title">Home of the <span>{CLUB_NICKNAME}.</span></h1>}
          <p className="nd-lead mb-7">{lead}</p>
          <div className="mb-5 flex flex-wrap gap-3">
            <Link href={ctaUrl} className="btn-primary">{ctaLabel}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            <Link href="/fixtures" className="btn-secondary">View fixtures</Link>
          </div>
          {vouchers && (
            <a href={`#${vouchers.anchorId}`} className="nd-voucher-chip focus-ring">
              <b>Up to $200</b>
              <span>{vouchers.heroLinkLabel}</span>
            </a>
          )}
          {stats}
        </div>
        <div className="nd-hero-media">
          {season && <span className="nd-season-tag">{season}</span>}
          <div className="relative z-2 [&_figure]:rounded-[28px]">
            <ClubIntro />
          </div>
          <CricketBall className="nd-hero-ball" />
        </div>
      </div>
    </section>
  );
}

// Published events and home calendar entries, read once per render and shared
// by the next-event card and "Coming up".
const getHomeEvents = cache(() => getPublicEvents());
const getHomeCalendar = cache(() => getUpcomingCalendarEvents({ limit: 6, home: true }));

function NextEventShell({ children }: { children: ReactNode }) {
  return (
    <section className="nd-sec-tight pt-0!" aria-labelledby="next-event-title">
      <div className="nd-wrap">{children}</div>
    </section>
  );
}

function NextEventSkeleton() {
  return (
    <NextEventShell>
      <div className="nd-card nd-event-body" aria-busy="true">
        <span className="nd-eyebrow">Next event</span>
        <h2 id="next-event-title" className="sr-only">Next event</h2>
        <div className="h-9 w-2/3 animate-pulse rounded-sm bg-surface-muted" />
        <div className="space-y-2">{[0, 1, 2].map((index) => <div key={index} className="h-5 w-1/2 animate-pulse rounded-sm bg-surface-muted" />)}</div>
      </div>
    </NextEventShell>
  );
}

// Status of the calendar entries linked to one event, read directly (not
// from the capped "Coming up" list). 'unknown' when the read fails, so the
// hero falls back to a neutral details link instead of advertising booking.
async function linkedCalendarStatus(eventId: string): Promise<'cancelled' | 'postponed' | 'unknown' | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return 'unknown';
  try {
    const { data, error } = await createServerClient({ publicReadCache: true, fetchTimeoutMs: 8_000 })
      .from('calendar_events').select('status').eq('source_event_id', eventId);
    if (error || !Array.isArray(data)) return 'unknown';
    const statuses = data.map((row) => (row as { status?: unknown }).status);
    return statuses.includes('cancelled') ? 'cancelled' : statuses.includes('postponed') ? 'postponed' : null;
  } catch {
    return 'unknown';
  }
}


async function NextEventSection() {
  const { data: events, degraded } = await getHomeEvents();
  const event = selectNextEvent(events, Date.now());
  if (!event) {
    return (
      <NextEventShell>
        <div className="nd-card nd-event-body">
          <span className="nd-eyebrow">Next event</span>
          <h2 id="next-event-title">{degraded ? 'Events could not be loaded right now' : 'No upcoming event is published yet'}</h2>
          <p className="nd-lead">{degraded ? 'Please try again shortly, or check the events page and club calendar.' : 'New club events are added to the events page and club calendar.'}</p>
          <div className="flex flex-wrap gap-x-6">
            <Link href="/events" className="nd-link">All events</Link>
            <Link href="/calendar" className="nd-link">Club calendar</Link>
          </div>
        </div>
      </NextEventShell>
    );
  }
  const day = formatEventDay(event.date);
  const time = formatClubTime(event.date);
  const venue = event.location?.trim();
  const price = Number(event.ticket_price);
  const songs = event.registration_mode === 'song_requests';
  const snails = event.registration_mode === 'snail_race';
  // A cancellation or postponement recorded on the event's own calendar
  // entries wins, so the card never keeps advertising booking for it.
  const status = await linkedCalendarStatus(event.id);
  // Registration closes at the start time, so an event that is on now keeps
  // a neutral details link rather than offering booking.
  const started = Date.parse(event.date) <= Date.now();
  const summary = event.description?.trim() ? truncateText(event.description.trim(), 180) : null;
  return (
    <NextEventShell>
      <div className={`nd-card ${event.image_url ? 'nd-event-feature' : ''}`}>
        {event.image_url && (
          <div className="nd-poster">
            <SafeImage
              src={event.image_url}
              alt={`${event.title} poster`}
              width={420}
              height={594}
              sizes="(max-width: 980px) 90vw, 380px"
              className="h-auto w-auto"
              fallback={<span className="sr-only">Poster unavailable</span>}
            />
          </div>
        )}
        <div className="nd-event-body">
          <p className="nd-eyebrow">
            {started && status !== 'cancelled' && status !== 'postponed' ? 'On now' : 'Next event'}
            {(status === 'cancelled' || status === 'postponed') && <span className="ml-2 rounded-full bg-maroon-700 px-2 py-0.5 normal-case tracking-normal text-white dark:bg-maroon-300 dark:text-maroon-950">{status === 'cancelled' ? 'Cancelled' : 'Postponed'}</span>}
          </p>
          <h2 id="next-event-title" className={status === 'cancelled' ? 'line-through' : undefined}>{event.title}</h2>
          {summary && <p className="nd-lead">{summary}</p>}
          <dl className="nd-facts">
            <dt>When</dt>
            <dd>{day ? <time dateTime={event.date}>{day}</time> : 'Date to be confirmed'}{`, ${time || 'time to be confirmed'}`}</dd>
            {venue && <><dt>Where</dt><dd>{venue}</dd></>}
            {Number.isFinite(price) && <><dt>Price</dt><dd>{price > 0 ? `${formatCurrency(price)}${songs ? ' per song' : snails ? ' per snail' : ''}` : 'Free entry'}</dd></>}
          </dl>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {status === 'cancelled' ? (
              <Link href="/calendar" className="btn-secondary">Check the club calendar</Link>
            ) : (
              <Link href={`/events/${event.id}`} className="btn-primary">
                {started || status === 'postponed' || status === 'unknown' || event.online_registration_enabled === false ? 'Event details' : songs ? 'Details and song requests' : snails ? 'Details and snail purchases' : 'Details and booking'}<span className="sr-only">: {event.title}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
            <Link href="/events" className="nd-link">All events</Link>
          </div>
        </div>
      </div>
    </NextEventShell>
  );
}

async function HeroSection() {
  const [blocks, season, vouchers] = await Promise.all([getHomeBlocks(), getHomeSeason(), getJuniorGetActiveVouchers().catch(() => null)]);
  return (
    <HeroView
      title={blocks['home.hero']?.title || CLUB_NAME}
      body={blocks['home.hero']?.body || HERO_DEFAULT_BODY}
      ctaLabel={blocks['home.hero']?.cta_label || 'Join the club'}
      ctaUrl={blocks['home.hero']?.cta_url || '/join'}
      season={seasonLine(season?.name)}
      vouchers={vouchers}
      stats={<Suspense fallback={null}><HomeStatsStrip /></Suspense>}
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
  // A failed team discovery leaves the team list incomplete, so "not yet
  // published" is only claimed when every competition was read.
  const discoveryComplete = !(playhq.warnings || []).some((warning) => /^Team discovery failed/i.test(warning));
  for (const team of discoveryComplete ? teamsAwaitingPlayHQ(cmsTeams, playhq.teams) : []) {
    board.push({ state: 'awaiting', teamId: `cms-${team.id || team.slug}`, teamName: team.name.trim(), gradeName: team.grade?.trim() || null, fixture: null, href: `/teams/${team.slug}` });
  }
  if (board.length === 0) return null;
  return { board, clubPlayHQUrl: settings.playhq_url || PLAYHQ_ORG_URL };
});


const SEASON_STATUS_DEFAULT_BODY = 'Match-day notices and club announcements are posted on our';

function ExternalLinkIcon() {
  return <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
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
  const gradeLine = (
    <p className="nd-fx-grade">
      {row.state === 'awaiting' ? <Link href={row.href} className="hover:underline">{label}</Link> : label}
      {grade && <> <span aria-hidden="true">·</span> {grade}</>}
    </p>
  );
  const fixture = row.fixture;
  if (!fixture) {
    return (
      <li className="nd-fx">
        <div className="nd-fx-date"><b aria-hidden="true">–</b><span className="sr-only">No date yet</span></div>
        <div className="min-w-0">
          {gradeLine}
          <p className="nd-fx-opp">{row.state === 'unavailable' ? 'Fixture details could not be loaded here.' : row.state === 'awaiting' ? 'Fixture not yet published by GCA on PlayHQ.' : 'Fixture not yet released by GCA.'}</p>
          <p className="nd-fx-meta">
            {row.state === 'unavailable'
              ? <a href={clubPlayHQUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-maroon-700 underline underline-offset-4 dark:text-maroon-300">Check PlayHQ<span className="sr-only"> for {row.teamName}</span></a>
              : 'Check back soon'}
          </p>
        </div>
        <div />
      </li>
    );
  }
  const home = fixture.homeAway === 'Home';
  const parts = fixture.startsAt ? comingUpDateParts(fixture.startsAt) : null;
  const time = fixture.startsAt && !fixture.dateOnly ? formatClubTime(fixture.startsAt) : null;
  return (
    <li className="nd-fx">
      <div className="nd-fx-date">
        {parts ? <time dateTime={fixture.startsAt || undefined}><small>{parts.weekday}</small><b>{parts.day} {parts.month}</b></time> : <><small>Date</small><b>TBC</b></>}
      </div>
      <div className="min-w-0">
        {gradeLine}
        <p className="nd-fx-opp">v {fixture.opponent}</p>
        <p className="nd-fx-meta">{[fixture.venue, time || 'time TBC'].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="nd-fx-side">
        <span className={`nd-pill ${home ? 'nd-pill-home' : ''}`}>{fixture.homeAway}</span>
        <a href={fixture.playHQUrl || clubPlayHQUrl} target="_blank" rel="noopener noreferrer" className="nd-link min-h-0! text-sm">
          PlayHQ<span className="sr-only">: {row.teamName} v {fixture.opponent} (opens in a new tab)</span>
          <ExternalLinkIcon />
        </a>
      </div>
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
    <section className="nd-sec-tight" aria-labelledby="home-fixtures-title">
      <div className="nd-wrap">
        <SectionHeading id="home-fixtures-title" eyebrow="Fixtures" title="Next matches">
          <Link href="/fixtures" className="nd-link">All fixtures and results</Link>
        </SectionHeading>
        {loading ? (
          <div className="nd-card space-y-2 p-5" aria-busy="true">{[0, 1, 2, 3].map((index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-surface-muted" />)}</div>
        ) : groups.length > 0 && matchDay ? (
          <NextMatchesTabs
            label="Competition"
            tabs={groups.map((group) => ({
              key: group.category,
              label: group.label,
              panel: (
                <div className="nd-card overflow-hidden">
                  <ul className="nd-fx-list" aria-label={`${group.label} next matches`}>
                    {sortBoardRows(group.items).map((row) => <MatchRow key={row.teamId} row={row} clubPlayHQUrl={matchDay.clubPlayHQUrl} />)}
                  </ul>
                </div>
              ),
            }))}
          />
        ) : (
          <p className="nd-card px-5 py-4 text-base text-content-secondary">
            Next matches could not be loaded here right now.{' '}
            <a href={ctaUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-maroon-700 underline underline-offset-4 dark:text-maroon-300">Check fixtures on PlayHQ</a>.
          </p>
        )}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed text-content-muted">
            <span className="font-semibold text-content-primary">{statusTitle}.</span>{' '}
            {statusBody}{' '}
            <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-maroon-700 underline underline-offset-4 dark:text-maroon-300">
              Facebook page
            </a>.
          </p>
          <a href={ctaUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
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
      statusTitle={renderSeasonContent(block?.title || 'Season Update', currentSeason).replace(/[.\s]+$/, '')}
      statusBody={renderSeasonContent(block?.body || SEASON_STATUS_DEFAULT_BODY, currentSeason)}
      ctaLabel={renderSeasonContent(block?.cta_label || 'View Results on PlayHQ', currentSeason)}
      ctaUrl={block?.cta_url || PLAYHQ_ORG_URL}
      matchDay={matchDay}
    />
  );
}

// ---------------------------------------------------------------------------
// Three cards: Coming up, Club news, Get involved (with Dino Coach).

const COMING_UP_KIND_LABEL: Record<ComingUpItem['kind'], string> = { fixture: 'Fixture', event: 'Club event', calendar: 'Calendar' };
const COMING_UP_PREVIEW_LIMIT = 4;

function ComingUpRow({ item, kindLabel }: { item: ComingUpItem; kindLabel: string }) {
  const parts = comingUpDateParts(item.startsAt);
  const cancelled = item.status === 'cancelled';
  const content = (
    <>
      <span className="nd-cal-tile" aria-hidden={parts ? undefined : true}>
        {parts && (
          <>
            <small>{parts.month.toUpperCase()}</small>
            <b>{parts.day}</b>
            <span className="sr-only"> {parts.weekday}</span>
          </>
        )}
      </span>
      <span className="min-w-0">
        <strong className={`group-hover:underline ${cancelled ? 'line-through' : ''}`}>{item.title}</strong>
        <span className="nd-mini-meta">
          {kindLabel}
          {item.status && <span className="ml-1.5 font-semibold text-maroon-700 dark:text-maroon-300">{cancelled ? 'Cancelled' : 'Postponed'}</span>}
          {item.detail && <>, {item.detail}</>}
        </span>
      </span>
    </>
  );
  const rowClass = 'group nd-mini-row focus-ring rounded-lg';
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
  return <section aria-labelledby={id} className="nd-card flex min-w-0 flex-col">{children}</section>;
}

function PreviewSkeleton({ id, title, href }: { id: string; title: string; href: string }) {
  return (
    <PreviewPanel id={id}>
      <PreviewHeading id={id} title={title} href={href} linkLabel={title.toLowerCase()} />
      <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((index) => <div key={index} className="h-11 animate-pulse rounded-sm bg-surface-muted" />)}</div>
    </PreviewPanel>
  );
}

async function ComingUpPreview() {
  const now = Date.now();
  const [{ data: events, degraded: eventsDegraded }, calendarResult] = await Promise.all([
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
        <ul className="nd-mini">
          {items.map((item) => <ComingUpRow key={item.key} item={item} kindLabel={calendarTypeLabels.get(item.key) ?? COMING_UP_KIND_LABEL[item.kind]} />)}
        </ul>
      ) : (
        eventsDegraded || calendarResult.degraded
          ? <p className="py-2 text-sm text-content-muted">Dates could not be loaded right now. <Link href="/calendar" className="underline">Try the club calendar</Link>.</p>
          : <p className="py-2 text-sm text-content-muted">Nothing else is scheduled yet. <Link href="/events" className="underline">See all events</Link>.</p>
      )}
      <Link href="/events" className="nd-link mt-auto">All events</Link>
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
  const articles = news.slice(0, NEWS_PREVIEW_LIMIT);
  const publication = publications?.[0] ?? null;

  return (
    <PreviewPanel id="club-news-title">
      <PreviewHeading id="club-news-title" title={cmsCopy(blocks['home.welcome']?.title) || 'Club news'} href="/news" linkLabel="club news" />
      {cmsCopy(blocks['home.welcome']?.body) && <p className="mb-1 line-clamp-3 text-sm text-content-secondary">{cmsCopy(blocks['home.welcome']?.body)}</p>}
      {articles.length > 0 ? (
        <ul className="nd-mini">
          {articles.map((article) => (
            <li key={article.id}>
              <Link href={`/news/${article.id}`} className="group block rounded-lg py-3 focus-ring">
                {article.published_at && <span className="nd-mini-meta"><time dateTime={article.published_at}>{formatDate(article.published_at)}</time></span>}
                <strong className="group-hover:underline">{article.title}</strong>
              </Link>
            </li>
          ))}
          {publication && (
            <li>
              <Link href={`/publications/${publication.slug}`} className="group block rounded-lg py-3 focus-ring">
                <span className="nd-mini-meta">Latest publication: {publicationTypeLabel(publication.publication_type)}, {formatDate(publication.issue_date)}</span>
                <strong className="group-hover:underline">{publication.title}</strong>
              </Link>
            </li>
          )}
        </ul>
      ) : (
        <p className="py-2 text-sm text-content-muted">
          News is temporarily unavailable. <Link href="/news" className="underline">Try the news page</Link> or visit our <a href={FACEBOOK_URL} className="underline">Facebook page</a>.
        </p>
      )}
      {publications === null && (
        <p className="mb-2 text-sm text-content-muted">Publications are temporarily unavailable. <Link href="/publications" className="underline">Try again</Link>.</p>
      )}
      <Link href="/news" className="nd-link mt-auto">All news</Link>
    </PreviewPanel>
  );
}

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
  { href: '/sponsors#enquiry-form', label: 'Sponsor us' },
  { href: '/contact', label: 'Contact the club' },
];

type QuickLink = { id: string; href: string; title: string; description?: string | null; icon?: string | null };

function GetInvolvedView({ title, intro, quickLinks, quickLinksTitle, dinoCoach }: { title: string; intro: string | null; quickLinks: QuickLink[]; quickLinksTitle: string; dinoCoach: boolean }) {
  const fixedHrefs = new Set(GET_INVOLVED_LINKS.map((link) => link.href.split('#')[0]));
  const extraLinks = quickLinks.filter((link) => !fixedHrefs.has(link.href));
  return (
    <section className="nd-card flex min-w-0 flex-col" aria-labelledby="get-involved-title">
      <h2 id="get-involved-title">{title}</h2>
      {intro && <p className="mb-3 text-sm text-content-secondary">{intro}</p>}
      <ul className="nd-tiles">
        {GET_INVOLVED_LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="nd-tile focus-ring">
              <span>{link.label}</span>
              <ArrowRight className="h-4 w-4 flex-none text-content-muted" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      {dinoCoach && (
        <div className="nd-dino">
          <b>Dino Coach</b>
          {/* Same wording as the /fantasy page, so nothing here can go stale. */}
          <p>Build your 15-player NDCC squad with Dino Dollars, captain your stars and score points from real match performances.</p>
          <Link href="/fantasy">Play Dino Coach</Link>
          <Link href="/fantasy/leaderboard">Leaderboard</Link>
        </div>
      )}
      {extraLinks.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1! text-base!">{quickLinksTitle}</h3>
          <ul className="nd-mini mb-0!">
            {extraLinks.map((link) => (
              <li key={link.id}>
                <Link href={link.href} className="group nd-mini-row items-start focus-ring rounded-lg">
                  <QuickLinkIcon icon={link.icon} />
                  <span className="min-w-0">
                    <strong className="group-hover:underline">{link.title}</strong>
                    {link.description && <span className="nd-mini-meta">{link.description}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const GET_INVOLVED_DEFAULT_TITLE = 'Get involved';
const QUICK_LINKS_DEFAULT_TITLE = 'Around the club';

async function GetInvolvedSection() {
  const [blocks, quickLinks, dinoCoach] = await Promise.all([
    getHomeBlocks(),
    getPageLinkCards('home', 'quick_links'),
    isDinoCoachPublic().catch(() => false),
  ]);
  return (
    <GetInvolvedView
      title={cmsCopy(blocks['home.juniors']?.title) || GET_INVOLVED_DEFAULT_TITLE}
      intro={cmsCopy(blocks['home.juniors']?.body)}
      quickLinks={quickLinks}
      quickLinksTitle={cmsCopy(blocks['home.quicklinks']?.title) || QUICK_LINKS_DEFAULT_TITLE}
      dinoCoach={dinoCoach}
    />
  );
}

// ---------------------------------------------------------------------------
// Promotions: the Get Active Kids band and the Cookie Dough drive, each only
// while active.

function JuniorVoucherBand({ vouchers: VOUCHERS }: { vouchers: JuniorGetActiveVouchers }) {
  return (
    <section id={VOUCHERS.anchorId} className="nd-band-blue nd-sec-tight scroll-mt-28" aria-labelledby="vouchers-title">
      <div className="nd-wrap flex flex-wrap items-center justify-between gap-5">
        <div className="min-w-0 max-w-3xl">
          <p className="text-sm font-semibold">Support for junior families</p>
          <h2 id="vouchers-title">Get Active Kids vouchers: up to $200 per child</h2>
          <p className="mt-1 text-base leading-relaxed">
            Eligible Victorian children aged 0 to 18 may receive <strong>up to $200 each</strong> towards sport membership and registration fees.
            {' '}<strong>{VOUCHERS.roundLabel}:</strong> {VOUCHERS.startLabel} to <time dateTime={VOUCHERS.endsAt}>{VOUCHERS.endLabel}</time> (Victorian time), or earlier if funding runs out.
          </p>
          <details className="mt-2 text-sm leading-relaxed">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold underline underline-offset-4">Eligibility and reimbursement</summary>
            <p className="mt-1">Cricket Victoria advises this is the only round this season.</p>
            <p className="mt-2">Applying for cricket? Select <strong>Cricket Victoria</strong> as your activity provider. Check the official website for eligibility and current availability.</p>
            <p className="mt-2">Already paid? You may be eligible for reimbursement. See the official application page for details.</p>
          </details>
          <div className="mt-1 flex flex-wrap gap-x-6">
            <a href={VOUCHERS.applicationDetailsUrl} className="nd-link text-content-blue!">Voucher and reimbursement details</a>
            <Link href="/contact" className="nd-link text-content-blue!">Ask NDCC about junior cricket</Link>
          </div>
        </div>
        <a href={VOUCHERS.eligibilityUrl} className="btn-primary shrink-0">Check eligibility and apply<ExternalLinkIcon /></a>
      </div>
    </section>
  );
}

async function PromotionsSection() {
  const [vouchers, cookieDough] = await Promise.all([
    getJuniorGetActiveVouchers().catch(() => null),
    getCookieDoughCampaign().catch(() => null),
  ]);
  return (
    <>
      {vouchers && <JuniorVoucherBand vouchers={vouchers} />}
      {cookieDough && (
        <section className="nd-sec-tight" aria-label="Fundraiser">
          <div className="nd-wrap"><CookieDoughFundraiserFeature campaign={cookieDough} /></div>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sponsors: a static logo grid (white tiles; plates follow each logo's CMS
// surface mode so light-text artwork stays readable).

function SponsorLinks() {
  return (
    <>
      <Link href="/sponsors" className="nd-link">All sponsors</Link>
      <Link href="/sponsors#enquiry-form" className="nd-link">Become a sponsor</Link>
    </>
  );
}

function SponsorsSkeleton() {
  return (
    <section className="nd-sec" aria-labelledby="partners-title">
      <div className="nd-wrap">
        <SectionHeading id="partners-title" eyebrow="Thank you" title="Our Sponsors"><SponsorLinks /></SectionHeading>
        <div className="nd-logos">
          {[0, 1, 2, 3].map((index) => <div key={index} className="aspect-3/2 animate-pulse rounded-2xl bg-surface-muted" />)}
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
  const sponsorshipBody = cmsCopy(sponsorBlock?.body);

  return (
    <section className="nd-sec" aria-labelledby="partners-title">
      <div className="nd-wrap">
        <SectionHeading id="partners-title" eyebrow="Thank you" title={sponsorshipTitle}><SponsorLinks /></SectionHeading>
        {sponsorshipBody && <p className="nd-lead -mt-2 mb-5">{sponsorshipBody}</p>}
        <ul className="nd-logos" data-reveal-stagger="">
          {sponsors.map((sponsor) => {
            const tile = (
              <LogoChip
                name={sponsor.name}
                src={sponsor.logo_url}
                alt={sponsor.name}
                surfaceMode={sponsor.logo_surface_mode}
                paddingClassName={sponsor.logo_padding || 'p-4'}
                objectPosition={sponsor.logo_object_position}
                width={320}
                height={160}
                sizes="(max-width: 560px) 45vw, 190px"
                className="aspect-3/2 w-full rounded-2xl border-edge-subtle transition-colors group-hover:border-edge-strong"
                imageClassName="max-h-[72px] w-auto h-auto"
                fallback={<span className="px-2 text-center font-display text-[15px] font-semibold leading-tight text-[#1D1D1F]">{sponsor.name}</span>}
              />
            );
            return (
              <li key={sponsor.id} className="min-w-0">
                {sponsor.website ? (
                  <a href={sponsor.website} target="_blank" rel="noopener noreferrer" className="group block rounded-2xl focus-ring" aria-label={`Visit ${sponsor.name} website (opens in a new tab)`}>{tile}</a>
                ) : (
                  <div className="group" aria-label={sponsor.name}>{tile}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Toggle-gated rows: season appointments (club season toggle) and the gallery.

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


// Latest winners (last fortnight), hidden when none are published.
async function LatestWinnersSection() {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const winners = await getPublishedWinners({ since, limit: 4 }).catch(() => []);
  if (winners.length === 0) return null;
  return (
    <section className="nd-sec-tight" aria-labelledby="winners-title">
      <div className="nd-wrap">
        <SectionHeading id="winners-title" eyebrow="Congratulations" title="Latest winners">
          <Link href="/winners" className={headingLinkClass}>All winners</Link>
        </SectionHeading>
        <div className="grid gap-4 md:grid-cols-2">{winners.map((winner) => <WinnerCard key={winner.id} winner={winner} />)}</div>
      </div>
    </section>
  );
}

async function GalleryPreviewSection() {
  const { data: photos } = await getPublicGallery();
  const preview = photos.slice(0, 4);
  if (preview.length === 0) return null;

  return (
    <section className="nd-sec-tight" aria-labelledby="gallery-title">
      <div className="nd-wrap">
        <SectionHeading id="gallery-title" eyebrow="Club life" title="Gallery">
          <span className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <Link href="/gallery#season-highlights" className={headingLinkClass}>Watch the 2025/26 season video</Link>
            <Link href="/gallery" className={headingLinkClass}>View full gallery</Link>
          </span>
        </SectionHeading>
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {preview.map((photo) => (
            <li key={photo.id} className="relative aspect-video min-w-0 overflow-hidden rounded-2xl border border-edge-subtle bg-surface-muted">
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
            ctaLabel="Join the club"
            ctaUrl="/join"
            placeholder
          />
        }
      >
        <HeroSection />
      </Suspense>

      <Suspense fallback={<NextEventSkeleton />}>
        <NextEventSection />
      </Suspense>

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

      {/* Coming up, Club news and Get involved side by side (stacked on phones). */}
      <section className="nd-sec-tight" aria-label="Dates, news and ways to get involved">
        <div className="nd-wrap nd-trio">
          <Suspense fallback={<PreviewSkeleton id="this-week-title" title="Coming up" href="/calendar" />}>
            <ComingUpPreview />
          </Suspense>
          <Suspense fallback={<PreviewSkeleton id="club-news-title" title="Club news" href="/news" />}>
            <ClubNewsPreview />
          </Suspense>
          <Suspense fallback={<GetInvolvedView title={GET_INVOLVED_DEFAULT_TITLE} intro={null} quickLinks={[]} quickLinksTitle={QUICK_LINKS_DEFAULT_TITLE} dinoCoach={false} />}>
            <GetInvolvedSection />
          </Suspense>
        </div>
      </section>

      <Suspense fallback={null}>
        <PromotionsSection />
      </Suspense>

      <Suspense fallback={null}>
        <LatestWinnersSection />
      </Suspense>

      <Suspense fallback={<SponsorsSkeleton />}>
        <SponsorsSection />
      </Suspense>

      <Suspense fallback={null}>
        <SeasonAppointmentsSection />
      </Suspense>

      <Suspense fallback={null}>
        <GalleryPreviewSection />
      </Suspense>
    </>
  );
}
