import type { PlayHQFixture, PlayHQGrade, PlayHQLadderRow, PlayHQSeason, PlayHQTeam } from './types';

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function firstArray(payload: unknown): unknown[] {
  const root = asRecord(payload);
  for (const key of ['data', 'items', 'seasons', 'teams', 'grades', 'fixtures', 'games', 'ladder', 'ladders']) {
    if (Array.isArray(root[key])) return root[key] as unknown[];
  }
  if (Array.isArray(payload)) return payload;
  return [];
}
function text(...values: unknown[]) { return values.find((v) => typeof v === 'string' && v.trim()) as string | undefined; }
function num(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function entityName(value: unknown) { const r = asRecord(value); return text(r.name, r.displayName, r.fullName, r.teamName) || 'TBC'; }

export function normaliseSeasons(payload: unknown): PlayHQSeason[] {
  return firstArray(payload).map((item) => {
    const r = asRecord(item);
    const id = text(r.id, r.seasonId, r.uuid) || '';
    return { id, name: text(r.name, r.seasonName, r.displayName) || id, startDate: text(r.startDate, r.startsAt) || null, endDate: text(r.endDate, r.endsAt) || null };
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

export function normaliseFixtures(payload: unknown, grade: PlayHQGrade): PlayHQFixture[] {
  return firstArray(payload).map((item) => {
    const r = asRecord(item);
    const home = asRecord(r.homeTeam || r.home || r.homeTeamDetails);
    const away = asRecord(r.awayTeam || r.away || r.awayTeamDetails);
    const venue = asRecord(r.venue || r.ground);
    const id = text(r.id, r.gameId, r.fixtureId, r.matchId) || '';
    return {
      id,
      gradeId: grade.id,
      gradeName: grade.name,
      homeTeam: entityName(home) || text(r.homeTeamName) || 'TBC',
      awayTeam: entityName(away) || text(r.awayTeamName) || 'TBC',
      startsAt: text(r.startTime, r.startsAt, r.date, r.scheduledStartTime) || null,
      venue: text(venue.name, r.venueName, r.groundName) || null,
      status: text(r.status, r.gameStatus, r.resultStatus) || null,
      homeScore: text(r.homeScore, r.homeTeamScore) || null,
      awayScore: text(r.awayScore, r.awayTeamScore) || null,
      playHQUrl: text(r.url, r.playHQUrl, r.publicUrl) || null,
    };
  }).filter((fixture) => fixture.id);
}

export function normaliseLadder(payload: unknown, grade: PlayHQGrade): PlayHQLadderRow[] {
  return firstArray(payload).map((item, index) => {
    const r = asRecord(item);
    const team = asRecord(r.team);
    return {
      gradeId: grade.id,
      gradeName: grade.name,
      teamName: text(r.teamName, team.name, r.name) || 'Team',
      position: num(r.position ?? r.rank) ?? index + 1,
      played: num(r.played ?? r.gamesPlayed),
      points: num(r.points),
      percentage: num(r.percentage ?? r.percent),
    };
  });
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
