// Pure helpers for public team pages and the /fixtures team filter (no I/O).
// Unit tested in scripts/test-playhq-mapping.mjs.
import { isClubTeamName, normaliseClubText } from './season-match';
import type { PlayHQFixture, PlayHQLadderRow, PlayHQTeam } from './types';

const MELBOURNE = 'Australia/Melbourne';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export { buildTeamSlugs } from './team-slug';

const ORDINAL_WORDS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8 };

export type TeamMatchKey = { ordinal: number | null; women: boolean; junior: boolean };

/** Team identity from a name: "Newcomb & District Women 1sts" -> {1, women}. */
export function teamMatchKey(name: string | null | undefined): TeamMatchKey {
  const words = normaliseClubText(name).split(' ').filter(Boolean);
  let ordinal: number | null = null;
  for (const word of words) {
    const numeric = word.match(/^(\d{1,2})(st|nd|rd|th)s?$/);
    if (numeric) { ordinal = Number(numeric[1]); break; }
    if (ORDINAL_WORDS[word]) { ordinal = ORDINAL_WORDS[word]; break; }
    const xi = word.match(/^(\d{1,2})(st|nd|rd|th)?xi$/);
    if (xi) { ordinal = Number(xi[1]); break; }
  }
  const women = words.some((word) => ['women', 'womens', 'woman', 'ladies', 'female', 'girls'].includes(word));
  const junior = words.some((word) => /^u\d{1,2}s?$/.test(word) || ['under', 'junior', 'juniors', 'girls', 'boys', 'youth'].includes(word));
  return { ordinal, women, junior };
}

function sameKey(a: TeamMatchKey, b: TeamMatchKey) {
  return a.ordinal !== null && a.ordinal === b.ordinal && a.women === b.women && a.junior === b.junior;
}

export type CmsTeamLike = { id?: string; name: string; grade?: string | null; playhq_team_id?: string | null };

/**
 * PlayHQ team for a CMS team card: the saved link first, then an exact name
 * match, then a unique ordinal/women/junior match among NDCC PlayHQ teams.
 * Returns null rather than guessing when the match is ambiguous.
 */
export function matchPlayHQTeam(cms: CmsTeamLike, playhqTeams: PlayHQTeam[]): PlayHQTeam | null {
  const linked = cms.playhq_team_id?.trim();
  if (linked) return playhqTeams.find((team) => team.id.toLowerCase() === linked.toLowerCase()) || null;
  const club = playhqTeams.filter((team) => isClubTeamName(team.name));
  const exact = club.filter((team) => normaliseClubText(team.name) === normaliseClubText(cms.name));
  if (exact.length === 1) return exact[0];
  for (const source of [cms.name, cms.grade]) {
    const key = teamMatchKey(source);
    if (key.ordinal === null) continue;
    const candidates = club.filter((team) => sameKey(teamMatchKey(team.name), key));
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) return null;
  }
  return null;
}

export function fixtureInvolvesTeam(fixture: PlayHQFixture, team: Pick<PlayHQTeam, 'id' | 'name'>): boolean {
  if (fixture.clubTeamIds?.includes(team.id)) return true;
  const name = normaliseClubText(team.name);
  return Boolean(name) && (normaliseClubText(fixture.homeTeam) === name || normaliseClubText(fixture.awayTeam) === name);
}

export function fixturesForTeam(fixtures: PlayHQFixture[], team: Pick<PlayHQTeam, 'id' | 'name'>): PlayHQFixture[] {
  return sortFixturesByDate(fixtures.filter((fixture) => fixtureInvolvesTeam(fixture, team)));
}

function fixtureTime(fixture: PlayHQFixture) {
  const time = Date.parse(fixture.startsAt || '');
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function sortFixturesByDate(fixtures: PlayHQFixture[]): PlayHQFixture[] {
  return [...fixtures].sort((a, b) => fixtureTime(a) - fixtureTime(b) || a.id.localeCompare(b.id));
}

const COMPLETED = ['FINAL', 'FINALISED', 'FINALIZED', 'COMPLETED', 'COMPLETE'];

export function isCompletedStatus(status: string | null | undefined): boolean {
  return COMPLETED.includes(String(status || '').toUpperCase().replace(/[^A-Z]/g, ''));
}

/** Melbourne calendar day key (YYYY-MM-DD). Date-only values are kept as given. */
export function fixtureDayKey(startsAt: string | null | undefined): string | null {
  if (!startsAt) return null;
  if (DATE_ONLY.test(startsAt)) return startsAt;
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: MELBOURNE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/**
 * Upcoming = not completed and on/after today's Melbourne date; results =
 * completed or dated before today. Date-only games stay upcoming all day.
 */
export function splitTeamFixtures(fixtures: PlayHQFixture[], now = new Date()) {
  const today = fixtureDayKey(now.toISOString()) as string;
  const upcoming: PlayHQFixture[] = [];
  const results: PlayHQFixture[] = [];
  for (const fixture of sortFixturesByDate(fixtures)) {
    const day = fixtureDayKey(fixture.startsAt);
    if (isCompletedStatus(fixture.status) || (day !== null && day < today)) results.push(fixture);
    else upcoming.push(fixture);
  }
  return { upcoming, results: results.reverse(), next: upcoming[0] || null };
}

/** "Sat 3 Oct 2026" in Melbourne time; date-only values are not shifted. */
export function formatFixtureDay(startsAt: string | null | undefined): string {
  const day = fixtureDayKey(startsAt);
  if (!day) return 'Date to be confirmed';
  const [year, month, date] = day.split('-').map(Number);
  // Assembled from parts so the output does not depend on ICU punctuation.
  const parts = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).formatToParts(new Date(Date.UTC(year, month - 1, date)));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((row) => row.type === type)?.value || '';
  return `${part('weekday')} ${part('day')} ${part('month')} ${part('year')}`;
}

/** Melbourne start time, or null when PlayHQ gave only a date. */
export function formatFixtureStartTime(startsAt: string | null | undefined): string | null {
  if (!startsAt || DATE_ONLY.test(startsAt)) return null;
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: MELBOURNE }).format(date);
}

export function opponentFor(fixture: PlayHQFixture, team: Pick<PlayHQTeam, 'id' | 'name'>) {
  const name = normaliseClubText(team.name);
  const homeMatches = normaliseClubText(fixture.homeTeam) === name;
  const awayMatches = normaliseClubText(fixture.awayTeam) === name;
  // Tagged games whose display name differs from the team list fall back to
  // the side that carries the club name.
  const isHome = homeMatches || (!awayMatches && isClubTeamName(fixture.homeTeam) && !isClubTeamName(fixture.awayTeam));
  return { opponent: isHome ? fixture.awayTeam : fixture.homeTeam, venueRole: isHome ? 'Home' as const : 'Away' as const };
}

export function ladderForGrade(ladders: PlayHQLadderRow[], gradeId: string | null | undefined): PlayHQLadderRow[] {
  if (!gradeId) return [];
  return ladders
    .filter((row) => row.gradeId === gradeId && row.teamName.trim() && row.teamName !== 'Team')
    .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER));
}

export function isLadderRowForTeam(row: PlayHQLadderRow, team: Pick<PlayHQTeam, 'name'>): boolean {
  return normaliseClubText(row.teamName) === normaliseClubText(team.name);
}

/** Tab label without the club prefix: "Newcomb & District Women 1sts" -> "Women 1sts". */
export function shortTeamLabel(name: string): string {
  const short = name.replace(/^\s*(newcomb\s*(?:&|and)\s*district(?:\s+cricket\s+club)?|newcomb|ndcc)\s+/i, '').trim();
  return short || name;
}

export type AppointmentLike = { name: string; role: string };

/**
 * Captain and coach for a team from season appointments. The role must name
 * the team (e.g. "1st XI Captain" for a "1st XI" or "Newcomb & District 1sts"
 * card); club-wide roles such as "Head Coach" are never attributed to a team.
 */
export function appointmentsForTeam(appointments: AppointmentLike[], cms: CmsTeamLike, playhqName?: string | null) {
  const cmsName = normaliseClubText(cms.name);
  const keys = [teamMatchKey(cms.name), playhqName ? teamMatchKey(playhqName) : null].filter((key): key is TeamMatchKey => Boolean(key && key.ordinal !== null));
  const namesTeam = (role: string) => {
    const text = normaliseClubText(role);
    if (cmsName && ` ${text} `.includes(` ${cmsName} `)) return true;
    const roleKey = teamMatchKey(role);
    return keys.some((key) => sameKey(roleKey, key));
  };
  let captain: string | null = null;
  let coach: string | null = null;
  for (const appointment of appointments) {
    const role = normaliseClubText(appointment.role);
    const words = role.split(' ');
    if (!appointment.name?.trim() || !namesTeam(appointment.role)) continue;
    if (!captain && words.includes('captain') && !words.includes('vice')) captain = appointment.name.trim();
    if (!coach && words.includes('coach') && !words.includes('assistant')) coach = appointment.name.trim();
  }
  return { captain, coach };
}
