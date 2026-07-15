import 'server-only';
import { unstable_cache } from 'next/cache';
import { getPlayHQConfig, LEGACY_BASE_URL } from './config';
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

type PlayHQPage = Record<string, unknown> & { metadata?: { hasMore?: boolean; nextCursor?: string | null } };

function appendCursor(path: string, cursor: string) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}cursor=${encodeURIComponent(cursor)}`;
}

function mergePlayHQPages(pages: unknown[]) {
  if (pages.length <= 1) return pages[0];
  const first = (pages[0] && typeof pages[0] === 'object' ? pages[0] : {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...first };
  for (const key of ['data', 'items', 'seasons', 'teams', 'grades', 'fixtures', 'games', 'ladder', 'ladders']) {
    const values = pages.flatMap((page) => {
      const record = (page && typeof page === 'object' ? page : {}) as Record<string, unknown>;
      return Array.isArray(record[key]) ? record[key] as unknown[] : [];
    });
    if (values.length) merged[key] = values;
  }
  return merged;
}

// The two documented PlayHQ hosts: the current unified host (tenant selected
// via the x-phq-tenant header) and the legacy Cricket Australia host from the
// original setup guide. Whichever host first answers successfully is cached
// for the lifetime of the server process so every later request uses it.
let activePlayHQBaseUrl: string | null = null;

export function getActivePlayHQBaseUrl(): string | null {
  return activePlayHQBaseUrl;
}

function alternatePlayHQBaseUrl(baseUrl: string): string | null {
  const candidates = ['https://api.playhq.com', LEGACY_BASE_URL];
  return candidates.find((candidate) => candidate !== baseUrl) ?? null;
}

async function playHQFetchFromHost(baseUrl: string, path: string, init: RequestInit, config: ReturnType<typeof getPlayHQConfig>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PLAYHQ_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', 'x-api-key': config.apiKey as string, 'x-phq-tenant': config.tenant, ...(init.headers || {}) },
      signal: controller.signal,
      next: { revalidate: config.revalidateSeconds },
    });
    if (!response.ok) throw new Error(`PlayHQ request failed with HTTP ${response.status}`);
    return response.json() as Promise<unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

async function playHQFetchPage(path: string, init: RequestInit = {}) {
  const config = getPlayHQConfig();
  if (!config.configured || !config.apiKey) throw new Error(`PlayHQ is not configured: ${config.missing.join(', ')}`);

  const primary = activePlayHQBaseUrl ?? config.baseUrl;
  try {
    const payload = await playHQFetchFromHost(primary, path, init, config);
    activePlayHQBaseUrl = primary;
    return payload;
  } catch (error) {
    // Contract self-healing: an auth/routing failure (401/403/404) on one
    // documented host is retried once against the other. A success flips the
    // cached active host; any other failure propagates unchanged.
    const message = error instanceof Error ? error.message : '';
    const alternate = alternatePlayHQBaseUrl(primary);
    if (!alternate || !/HTTP (401|403|404)/.test(message)) throw error;
    const payload = await playHQFetchFromHost(alternate, path, init, config);
    activePlayHQBaseUrl = alternate;
    return payload;
  }
}

async function playHQFetch(path: string, init: RequestInit = {}) {
  const pages: unknown[] = [];
  let nextPath = path;
  for (let page = 0; page < 100; page += 1) {
    const payload = await playHQFetchPage(nextPath, init) as PlayHQPage;
    pages.push(payload);
    const cursor = payload.metadata?.hasMore ? payload.metadata.nextCursor : null;
    if (!cursor) return mergePlayHQPages(pages);
    nextPath = appendCursor(path, cursor);
  }
  throw new Error('PlayHQ pagination exceeded 100 pages.');
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
