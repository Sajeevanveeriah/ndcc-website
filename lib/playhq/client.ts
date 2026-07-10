import 'server-only';
import { unstable_cache } from 'next/cache';
import { getPlayHQConfig } from './config';
import { normaliseFixtures, normaliseGrades, normaliseLadder, normaliseSeasons, normaliseTeams } from './normalise';
import type { PlayHQGrade, PlayHQPublicData, PlayHQSeason } from './types';

const PLAYHQ_TIMEOUT_MS = 8_000;

const endpoints = {
  organisationSeasons: (organisationId: string) => `/v1/organisations/${encodeURIComponent(organisationId)}/seasons`,
  seasonTeams: (seasonId: string) => `/v1/seasons/${encodeURIComponent(seasonId)}/teams`,
  seasonGrades: (seasonId: string) => `/v1/seasons/${encodeURIComponent(seasonId)}/grades`,
  cricketGradeFixture: (gradeId: string) => `/v2/cricket/grades/${encodeURIComponent(gradeId)}/fixture`,
  cricketGradeLadder: (gradeId: string) => `/v2/cricket/grades/${encodeURIComponent(gradeId)}/ladder`,
  cricketGameSummary: (gameId: string) => `/v2/cricket/games/${encodeURIComponent(gameId)}/summary`,
};

async function playHQFetch(path: string, init: RequestInit = {}) {
  const config = getPlayHQConfig();
  if (!config.configured || !config.apiKey) throw new Error(`PlayHQ is not configured: ${config.missing.join(', ')}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PLAYHQ_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', 'x-api-key': config.apiKey, ...(init.headers || {}) },
      signal: controller.signal,
      next: { revalidate: config.revalidateSeconds },
    });
    if (!response.ok) throw new Error(`PlayHQ request failed with HTTP ${response.status}`);
    return response.json() as Promise<unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getPlayHQSeasons() {
  const config = getPlayHQConfig();
  if (!config.configured || !config.organisationId) return [];
  return normaliseSeasons(await playHQFetch(endpoints.organisationSeasons(config.organisationId)));
}

export async function getPlayHQTeams(seasonId: string) {
  return normaliseTeams(await playHQFetch(endpoints.seasonTeams(seasonId)));
}

export async function getPlayHQGrades(seasonId: string) {
  return normaliseGrades(await playHQFetch(endpoints.seasonGrades(seasonId)));
}

export async function getPlayHQGradeFixtures(grade: PlayHQGrade) {
  return normaliseFixtures(await playHQFetch(endpoints.cricketGradeFixture(grade.id)), grade);
}

export async function getPlayHQGradeLadder(grade: PlayHQGrade) {
  return normaliseLadder(await playHQFetch(endpoints.cricketGradeLadder(grade.id)), grade);
}

export async function getPlayHQGameSummary(gameId: string) {
  return playHQFetch(endpoints.cricketGameSummary(gameId));
}

// Raw fixture payload for a grade. The fantasy importer needs the untouched
// round metadata that normaliseFixtures drops.
export async function getPlayHQGradeFixtureRaw(gradeId: string) {
  return playHQFetch(endpoints.cricketGradeFixture(gradeId));
}

// Prefer the season whose date range covers today, then the most recently started
// season, before falling back to whatever PlayHQ returned first.
function pickCurrentSeasonId(seasons: PlayHQSeason[]): string | null {
  const now = Date.now();
  const startOf = (season: PlayHQSeason) => Date.parse(season.startDate || '');
  const endOf = (season: PlayHQSeason) => Date.parse(season.endDate || '');
  const byStartDesc = [...seasons].sort((a, b) => (startOf(b) || 0) - (startOf(a) || 0));
  const covering = byStartDesc.find((season) => startOf(season) <= now && now <= endOf(season));
  const mostRecentlyStarted = byStartDesc.find((season) => startOf(season) <= now);
  return covering?.id || mostRecentlyStarted?.id || byStartDesc[0]?.id || null;
}

async function getPlayHQPublicDataUncached(): Promise<PlayHQPublicData> {
  const config = getPlayHQConfig();
  const fetchedAt = new Date().toISOString();
  if (!config.configured) {
    return { configured: false, message: 'Fixtures will appear once PlayHQ is configured.', fetchedAt, seasons: [], selectedSeasonId: null, teams: [], grades: [], fixtures: [], ladders: [], error: null };
  }

  try {
    const seasons = await getPlayHQSeasons();
    const selectedSeasonId = config.defaultSeasonId || pickCurrentSeasonId(seasons);
    if (!selectedSeasonId) return { configured: true, message: 'No PlayHQ seasons were returned for this organisation.', fetchedAt, seasons, selectedSeasonId: null, teams: [], grades: [], fixtures: [], ladders: [], error: null };

    const [teams, allGrades] = await Promise.all([getPlayHQTeams(selectedSeasonId), getPlayHQGrades(selectedSeasonId)]);
    const grades = config.defaultGradeIds.length ? allGrades.filter((grade) => config.defaultGradeIds.includes(grade.id)) : allGrades;
    const [fixturesByGrade, laddersByGrade] = await Promise.all([
      Promise.all(grades.map((grade) => getPlayHQGradeFixtures(grade).catch(() => []))),
      Promise.all(grades.map((grade) => getPlayHQGradeLadder(grade).catch(() => []))),
    ]);

    return { configured: true, fetchedAt, seasons, selectedSeasonId, teams, grades, fixtures: fixturesByGrade.flat(), ladders: laddersByGrade.flat(), error: null };
  } catch (error) {
    return { configured: true, message: 'PlayHQ data is temporarily unavailable.', fetchedAt, seasons: [], selectedSeasonId: null, teams: [], grades: [], fixtures: [], ladders: [], error: error instanceof Error ? error.message : 'Unknown PlayHQ error' };
  }
}

// unstable_cache options are fixed at module load, so read the configured TTL here
// rather than hardcoding it; getPlayHQConfig reads straight from process.env.
export const getPlayHQPublicData = unstable_cache(getPlayHQPublicDataUncached, ['playhq-public-data'], { revalidate: getPlayHQConfig().revalidateSeconds, tags: ['playhq'] });
