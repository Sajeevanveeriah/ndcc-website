// Pure selection helpers for the home page match-day board and "This week"
// list. No I/O and no '@/' runtime imports, so the logic is unit tested
// directly in scripts/test-home-match-day.mjs with recorded PlayHQ data.
import type { PlayHQFixture, PlayHQTeam } from '@/lib/playhq/types';

const CLUB_TIME_ZONE = 'Australia/Melbourne';
// A timed fixture stays on the board for the rest of its match day, so a game
// in progress is not replaced by next week's fixture at the first ball.
export const MATCH_DAY_WINDOW_MS = 10 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

type MatchDayFixture = {
  id: string;
  startsAt: string | null;
  dateOnly: boolean;
  opponent: string;
  venue: string | null;
  homeAway: 'Home' | 'Away';
  playHQUrl: string | null;
};

export type MatchDayEntry = {
  teamId: string;
  teamName: string;
  gradeName: string | null;
  /** 'scheduled': next fixture found. 'not_released': PlayHQ lists no
   *  upcoming fixture for the team. 'unavailable': the team's grade feed
   *  failed, so the site cannot say whether a fixture exists. */
  state: 'scheduled' | 'not_released' | 'unavailable';
  fixture: MatchDayFixture | null;
};

function normaliseTeamName(value: string | null | undefined): string {
  return String(value ?? '').toLowerCase().replace(/[’']/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function melbourneDateKey(instant: number): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLUB_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));
}

function fixtureTime(startsAt: string | null): number | null {
  if (!startsAt) return null;
  const time = Date.parse(startsAt);
  return Number.isFinite(time) ? time : null;
}

/** True when a dated fixture has not finished its match day yet. Date-only
 *  values are compared as Melbourne calendar dates, never as UTC midnight. */
export function isUpcomingFixture(startsAt: string | null, now: number): boolean {
  const time = fixtureTime(startsAt);
  if (time === null || !startsAt) return false;
  if (DATE_ONLY.test(startsAt)) return startsAt >= melbourneDateKey(now);
  return time >= now - MATCH_DAY_WINDOW_MS;
}

function hasResult(fixture: PlayHQFixture) {
  return Boolean(fixture.homeScore || fixture.awayScore);
}

function safePlayHQUrl(value: string | null | undefined): string | null {
  return typeof value === 'string' && /^https:\/\/[^\s]+$/i.test(value.trim()) ? value.trim() : null;
}

/**
 * The next fixture for every NDCC team PlayHQ lists for the current season.
 * - A graded team only matches fixtures in its own grade; an ungraded team
 *   (no gradeId from PlayHQ) matches by team name across grades.
 * - Dated upcoming fixtures win; an undated fixture without a result is used
 *   only when no dated one exists (shown as "Date TBC").
 * - Teams whose grade feed failed are marked 'unavailable', never 'not
 *   released', so the page never claims GCA has not released a fixture when
 *   the site simply could not read it.
 */
export function selectMatchDayBoard(
  teams: PlayHQTeam[],
  fixtures: PlayHQFixture[],
  now: number,
  unavailableGradeNames: ReadonlySet<string> = new Set(),
): MatchDayEntry[] {
  const uniqueTeams = [...new Map(teams.filter((team) => team.id && normaliseTeamName(team.name)).map((team) => [team.id, team])).values()];
  const entries = uniqueTeams.map<MatchDayEntry>((team) => {
    const name = normaliseTeamName(team.name);
    const candidates = fixtures.flatMap((fixture) => {
      if (team.gradeId && fixture.gradeId !== team.gradeId) return [];
      const home = normaliseTeamName(fixture.homeTeam) === name;
      const away = !home && normaliseTeamName(fixture.awayTeam) === name;
      if (!home && !away) return [];
      return [{ fixture, homeAway: home ? 'Home' as const : 'Away' as const }];
    });
    const dated = candidates
      .filter(({ fixture }) => isUpcomingFixture(fixture.startsAt, now))
      .sort((a, b) => (fixtureTime(a.fixture.startsAt) ?? 0) - (fixtureTime(b.fixture.startsAt) ?? 0));
    const undated = candidates.filter(({ fixture }) => fixtureTime(fixture.startsAt) === null && !hasResult(fixture));
    const chosen = dated[0] || undated[0];
    const gradeName = team.gradeName?.trim() || null;
    if (!chosen) {
      const unavailable = Boolean(gradeName && unavailableGradeNames.has(gradeName));
      return { teamId: team.id, teamName: team.name.trim(), gradeName, state: unavailable ? 'unavailable' : 'not_released', fixture: null };
    }
    const { fixture, homeAway } = chosen;
    const startsAt = fixtureTime(fixture.startsAt) === null ? null : fixture.startsAt;
    return {
      teamId: team.id,
      teamName: team.name.trim(),
      gradeName,
      state: 'scheduled',
      fixture: {
        id: fixture.id,
        startsAt,
        dateOnly: Boolean(startsAt && DATE_ONLY.test(startsAt)),
        opponent: (homeAway === 'Home' ? fixture.awayTeam : fixture.homeTeam).trim() || 'TBC',
        venue: fixture.venue?.trim() || null,
        homeAway,
        playHQUrl: safePlayHQUrl(fixture.playHQUrl),
      },
    };
  });
  // Graded teams first in grade order, ungraded teams last; stable by name.
  return entries.sort((a, b) => {
    if (!a.gradeName !== !b.gradeName) return a.gradeName ? -1 : 1;
    return (a.gradeName || '').localeCompare(b.gradeName || '') || a.teamName.localeCompare(b.teamName);
  });
}

/** Grade names whose fixture feed failed, read from PlayHQ public-data warnings. */
export function unavailableGradesFromWarnings(warnings: readonly string[] | undefined): Set<string> {
  const grades = new Set<string>();
  for (const warning of warnings || []) {
    const match = /^Fixtures for (.+?): /.exec(warning);
    if (match) grades.add(match[1].trim());
  }
  return grades;
}

/** "Sat 3 Oct, 1:00 pm" in Melbourne time; date-only values get "time TBC". */
export function formatMatchDayDate(startsAt: string | null): string {
  const parts = startsAt ? comingUpDateParts(startsAt) : null;
  if (!parts) return 'Date TBC';
  return `${parts.weekday} ${parts.day} ${parts.month}, ${formatClubTime(startsAt) ?? 'time TBC'}`;
}

/** Melbourne start time ("1:00 pm"), or null for date-only / missing values. */
export function formatClubTime(startsAt: string | null): string | null {
  if (!startsAt || DATE_ONLY.test(startsAt)) return null;
  const time = Date.parse(startsAt);
  if (!Number.isFinite(time)) return null;
  return new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: CLUB_TIME_ZONE }).format(new Date(time));
}

export type ComingUpItem = {
  key: string;
  kind: 'fixture' | 'event' | 'calendar';
  /** ISO instant or YYYY-MM-DD used for ordering and the date column. */
  startsAt: string;
  title: string;
  detail: string | null;
  href: string;
  external: boolean;
  status: 'cancelled' | 'postponed' | null;
};

/** Melbourne weekday / day / month parts for the date column. */
export function comingUpDateParts(startsAt: string): { weekday: string; day: string; month: string } | null {
  const time = Date.parse(startsAt);
  if (!Number.isFinite(time)) return null;
  const timeZone = DATE_ONLY.test(startsAt) ? 'UTC' : CLUB_TIME_ZONE;
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-AU', { ...options, timeZone }).format(new Date(time));
  return { weekday: part({ weekday: 'short' }), day: part({ day: 'numeric' }), month: part({ month: 'short' }) };
}

/** Fixtures that start within the next `days` days (and are still upcoming). */
export function fixturesWithinDays(entries: MatchDayEntry[], now: number, days = 7): MatchDayEntry[] {
  const horizon = now + days * DAY_MS;
  return entries.filter((entry) => {
    const startsAt = entry.fixture?.startsAt;
    if (!startsAt || !isUpcomingFixture(startsAt, now)) return false;
    return (fixtureTime(startsAt) ?? Infinity) <= horizon;
  });
}

/**
 * One date-ordered list. Items with the same title on the same Melbourne day
 * (a club event also published to the calendar) are shown once, preferring
 * the earlier source in the input order.
 */
export function mergeComingUp(items: ComingUpItem[]): ComingUpItem[] {
  const seen = new Set<string>();
  const unique: ComingUpItem[] = [];
  for (const item of items) {
    const time = Date.parse(item.startsAt);
    if (!Number.isFinite(time)) continue;
    const day = DATE_ONLY.test(item.startsAt) ? item.startsAt : melbourneDateKey(time);
    const key = `${normaliseTeamName(item.title)}|${day}`;
    if (item.kind !== 'fixture' && seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** True when every item starts within `days` days of now. */
export function allWithinDays(items: ComingUpItem[], now: number, days = 7): boolean {
  const horizon = now + days * DAY_MS;
  return items.every((item) => Date.parse(item.startsAt) <= horizon);
}
