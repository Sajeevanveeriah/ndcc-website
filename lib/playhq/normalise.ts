import type { PlayHQFixture, PlayHQGrade, PlayHQLadderRow, PlayHQSeason, PlayHQTeam } from './types';

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function firstArray(payload: unknown): unknown[] {
  const root = asRecord(payload);
  for (const key of ['data', 'items', 'seasons', 'teams', 'grades', 'fixtures', 'games', 'ladder', 'ladders']) {
    if (Array.isArray(root[key])) return root[key] as unknown[];
  }
  // Some PlayHQ endpoints wrap their collection one level deeper as
  // { data: { items: [...] } }. Treat that envelope exactly like the flat
  // response instead of reporting a false empty season or fixture list.
  const data = asRecord(root.data);
  for (const key of ['items', 'seasons', 'teams', 'grades', 'fixtures', 'games', 'ladder', 'ladders']) {
    if (Array.isArray(data[key])) return data[key] as unknown[];
  }
  if (Array.isArray(payload)) return payload;
  return [];
}
function text(...values: unknown[]) { return values.find((v) => typeof v === 'string' && v.trim()) as string | undefined; }
function num(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function entityName(value: unknown) {
  const r = asRecord(value);
  const team = asRecord(r.team);
  const competitor = asRecord(r.competitor);
  const organisation = asRecord(r.organisation);
  return text(
    r.name, r.displayName, r.fullName, r.teamName,
    team.name, team.displayName, team.teamName,
    competitor.name, competitor.displayName, competitor.teamName,
    organisation.name, organisation.displayName
  );
}

export function normaliseSeasons(payload: unknown): PlayHQSeason[] {
  return firstArray(payload).map((item) => {
    const r = asRecord(item);
    const id = text(r.id, r.seasonId, r.uuid) || '';
    const competition = asRecord(r.competition);
    const association = asRecord(r.association);
    return {
      id,
      name: text(r.name, r.seasonName, r.displayName) || id,
      startDate: text(r.startDate, r.startsAt) || null,
      endDate: text(r.endDate, r.endsAt) || null,
      // Organisations are often registered in several identically-named
      // seasons (one per competition); keep the competition/association name
      // as disambiguation evidence.
      competitionName: text(competition.name, association.name, r.competitionName, r.associationName) || null,
    };
  }).filter((season) => season.id);
}

export function normaliseTeams(payload: unknown): PlayHQTeam[] {
  return firstArray(payload).map((item) => {
    const r = asRecord(item);
    const grade = asRecord(r.grade);
    const id = text(r.id, r.teamId, r.uuid) || '';
    return { id, name: text(r.name, r.teamName, r.displayName) || id, gradeId: text(r.gradeId, grade.id) || null, gradeName: text(r.gradeName, grade.name) || null };
  }).filter((team) => team.id);
}

export function normaliseGrades(payload: unknown): PlayHQGrade[] {
  return firstArray(payload).map((item) => {
    const r = asRecord(item);
    const id = text(r.id, r.gradeId, r.uuid) || '';
    return { id, name: text(r.name, r.gradeName, r.displayName) || id, seasonId: text(r.seasonId) || null };
  }).filter((grade) => grade.id);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const CLUB_TIME_ZONE = 'Australia/Melbourne';

// Offset in minutes of a time zone at a UTC instant, or null for a bad zone.
function offsetAt(instant: number, timeZone: string): number | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(instant));
  } catch {
    return null;
  }
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  return Math.round((Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute')) - instant) / 60_000);
}

// UTC offset ("+11:00") of a time zone at a given local date and time. The
// offset is read at the wall-clock-as-UTC guess, then re-read at the instant
// that offset implies, so times near a daylight-saving change resolve to the
// offset in force at the fixture itself.
function zoneOffset(date: string, hours: number, minutes: number, timeZone: string): string | null {
  const [year, month, day] = date.split('-').map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hours, minutes);
  const first = offsetAt(wallClock, timeZone);
  if (first === null) return null;
  const offset = offsetAt(wallClock - first * 60_000, timeZone) ?? first;
  const abs = Math.abs(offset);
  return `${offset < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

// Fixture start as an ISO instant when PlayHQ gives a time, else the plain
// date. PlayHQ v1 games carry schedule { date, time, timezone } with a local
// date and time; a date-only field must not hide a start time sent elsewhere.
function fixtureStart(r: Record<string, unknown>, schedule: Record<string, unknown>): string | null {
  const candidates = [r.startTime, r.startsAt, r.scheduledStartTime, r.date, schedule.startTime, schedule.dateTime, schedule.date]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .map((value) => value.trim());
  const timed = candidates.find((value) => !DATE_ONLY.test(value) && Number.isFinite(Date.parse(value)));
  if (timed) return timed;
  const date = candidates.find((value) => DATE_ONLY.test(value)) || null;
  const time = LOCAL_TIME.exec(text(schedule.time, schedule.localTime, schedule.startTime, r.time) || '');
  if (!date || !time) return date;
  const hours = Number(time[1]);
  const minutes = Number(time[2]);
  if (hours > 23 || minutes > 59) return date;
  const offset = zoneOffset(date, hours, minutes, text(schedule.timezone, schedule.timeZone, r.timezone) || CLUB_TIME_ZONE)
    ?? zoneOffset(date, hours, minutes, CLUB_TIME_ZONE);
  return offset ? `${date}T${String(hours).padStart(2, '0')}:${time[2]}:${time[3] || '00'}${offset}` : date;
}

// PlayHQ's public fixture gives each competitor scoreTotal (runs only, no
// wickets) and an outcome. Only a decided game shows a score: an abandoned or
// unplayed game also reports scoreTotal 0, which is not a score.
const DECIDED_OUTCOMES = new Set(['WON', 'LOST', 'DRAW', 'DRAWN', 'TIE', 'TIED']);
function competitorScore(competitor: Record<string, unknown>): string | null {
  if (!DECIDED_OUTCOMES.has(String(competitor.outcome ?? '').toUpperCase())) return null;
  const runs = competitor.scoreTotal;
  return typeof runs === 'number' && Number.isFinite(runs) && runs >= 0 ? String(runs) : null;
}

export function normaliseFixtures(payload: unknown, grade: PlayHQGrade): PlayHQFixture[] {
  return firstArray(payload).map((item) => {
    const r = asRecord(item);
    // PlayHQ v1 game entries carry teams as a competitors array (with an
    // isHome/homeAway marker) and scheduling under a schedule object; older
    // shapes used home/away objects. Support both.
    const competitors = Array.isArray(r.competitors) ? (r.competitors as unknown[]).map(asRecord) : [];
    const isHomeCompetitor = (c: Record<string, unknown>) => c.isHomeTeam === true || c.isHome === true || String(c.homeAway ?? c.side ?? '').toLowerCase() === 'home';
    const homeCompetitor = competitors.find((c) => isHomeCompetitor(c));
    const awayCompetitor = competitors.find((c) => !isHomeCompetitor(c));
    const home = asRecord(r.homeTeam || r.home || r.homeTeamDetails || homeCompetitor);
    const away = asRecord(r.awayTeam || r.away || r.awayTeamDetails || awayCompetitor);
    const venue = asRecord(r.venue || r.ground);
    // PlayHQ sends schedule as one object, or as an array (one entry per
    // match day) for multi-day games; the first entry is the start.
    const schedule = asRecord(Array.isArray(r.schedule) ? r.schedule[0] : r.schedule);
    const id = text(r.id, r.gameId, r.fixtureId, r.matchId) || '';
    return {
      id,
      gradeId: grade.id,
      gradeName: grade.name,
      homeTeam: entityName(home) || text(r.homeTeamName) || 'TBC',
      awayTeam: entityName(away) || text(r.awayTeamName) || 'TBC',
      startsAt: fixtureStart(r, schedule),
      venue: text(venue.name, r.venueName, r.groundName) || null,
      status: text(r.status, r.gameStatus, r.resultStatus) || null,
      homeScore: text(r.homeScore, r.homeTeamScore) || competitorScore(home) || null,
      awayScore: text(r.awayScore, r.awayTeamScore) || competitorScore(away) || null,
      playHQUrl: text(r.url, r.playHQUrl, r.publicUrl) || null,
    };
  }).filter((fixture) => fixture.id);
}

// PlayHQ nests ladder rows: v1 sends data[] of { grade, ladders: [{ standings }] }
// and v2 sends { ladders: [{ headers, standings: [{ team, values }] }] }, where
// values line up with headers by position. Flat row arrays are still accepted.
function ladderStandings(payload: unknown): Record<string, unknown>[][] {
  const tables: Record<string, unknown>[][] = [];
  const visitLadder = (ladder: Record<string, unknown>) => {
    const headers = Array.isArray(ladder.headers) ? ladder.headers.map((header) => text(asRecord(header).key) || '') : [];
    const standings = Array.isArray(ladder.standings) ? ladder.standings.map(asRecord) : [];
    tables.push(standings.map((row) => {
      if (!Array.isArray(row.values) || !headers.length) return row;
      const values = row.values as unknown[];
      return { ...Object.fromEntries(headers.map((key, i) => [key, values[i]]).filter(([key]) => key)), ...row };
    }));
  };
  const flat: Record<string, unknown>[] = [];
  for (const item of firstArray(payload).map(asRecord)) {
    if (Array.isArray(item.ladders)) item.ladders.map(asRecord).forEach(visitLadder);
    else if (Array.isArray(item.standings)) visitLadder(item);
    else flat.push(item);
  }
  if (flat.length) tables.push(flat);
  return tables;
}

export function normaliseLadder(payload: unknown, grade: PlayHQGrade): PlayHQLadderRow[] {
  return ladderStandings(payload).flatMap((rows) => rows.map((r, index) => {
    const team = asRecord(r.team);
    return {
      gradeId: grade.id,
      gradeName: grade.name,
      teamName: text(r.teamName, team.name, r.name) || 'Team',
      // Standings arrive in ladder order; PlayHQ's own ranking is 0-based.
      position: num(r.position ?? r.rank) ?? index + 1,
      played: num(r.played ?? r.gamesPlayed),
      points: num(r.points ?? r.competitionPoints),
      percentage: num(r.percentage ?? r.percent),
    };
  }));
}

export function normalisePlayHqPlayer(input: import('./types').PlayHqPlayerInput, source: string): import('./types').NormalisedPlayHqPlayer {
  const firstName = text(input.firstName) || '';
  const lastName = text(input.lastName) || '';
  const displayName = text(input.displayName, `${firstName} ${lastName}`.trim()) || 'Unknown Player';
  return {
    playhq_player_id: text(input.playerId, input.id, input.sourceUrl, displayName) || displayName,
    display_name: displayName,
    first_name: firstName,
    last_name: lastName,
    team_label: text(input.teamName) || '',
    grade_label: text(input.gradeName) || '',
    role: text(input.role) || 'player',
    source,
  };
}

// A date-only provider value has no kickoff time. Do not turn UTC midnight
// into a fictitious 10/11 am Melbourne start when displaying that date.
export function formatFixtureTime(value: string | null) {
  if (!value) return 'Date TBC';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date TBC';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeZone: 'UTC' }).format(date)} - time TBC`;
  }
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Melbourne' }).format(date);
}
