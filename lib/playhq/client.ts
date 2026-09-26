import 'server-only';
import { unstable_cache } from 'next/cache';
import { getCurrentClubSeason } from '@/lib/club-seasons';
import { currentPublicSeasons, isClubTeamName } from './season-match';
import { getPlayHQConfig, LEGACY_BASE_URL } from './config';
import { normaliseFixtures, normaliseGrades, normaliseLadder, normaliseSeasons, normaliseTeams } from './normalise';
import { hasActiveMappings, mappedSeasonIds, mergeFixtures, selectMappedScope, type PlayHQMappingSet } from './mapping';
import { loadPlayHQMappings } from './mapping-store';
import type { PlayHQGrade, PlayHQPublicData, PlayHQSeason } from './types';

const PLAYHQ_TIMEOUT_MS = 8_000;

const endpoints = {
  organisationSeasons: (organisationId: string) => `/v1/organisations/${encodeURIComponent(organisationId)}/seasons`,
  seasonTeams: (seasonId: string) => `/v1/seasons/${encodeURIComponent(seasonId)}/teams`,
  seasonGrades: (seasonId: string) => `/v1/seasons/${encodeURIComponent(seasonId)}/grades`,
  cricketGradeFixture: (gradeId: string) => `/v2/cricket/grades/${encodeURIComponent(gradeId)}/fixture`,
  gradeFixture: (gradeId: string) => `/v1/grades/${encodeURIComponent(gradeId)}/fixture`,
  teamFixture: (teamId: string) => `/v1/teams/${encodeURIComponent(teamId)}/fixture`,
  cricketGradeLadder: (gradeId: string) => `/v2/cricket/grades/${encodeURIComponent(gradeId)}/ladder`,
  gradeLadder: (gradeId: string) => `/v1/grades/${encodeURIComponent(gradeId)}/ladder`,
  cricketGameSummary: (gameId: string) => `/v2/cricket/games/${encodeURIComponent(gameId)}/summary`,
  gameSummary: (gameId: string) => `/v1/games/${encodeURIComponent(gameId)}/summary`,
};

export type PlayHQEndpointUsage = { dataset: string; version: string; host: string | null; lastServedAt: string; counts: Record<string, number> };

// Which documented endpoint version last served each dataset in this server
// process (admin diagnostics only; never exposed publicly).
const endpointUsage = new Map<string, PlayHQEndpointUsage>();

function recordEndpoint(dataset: string, path: string) {
  const version = path.match(/^\/(v\d+)\//)?.[1] || 'unknown';
  const previous = endpointUsage.get(dataset);
  const counts = { ...(previous?.counts || {}) };
  counts[version] = (counts[version] || 0) + 1;
  endpointUsage.set(dataset, { dataset, version, host: activePlayHQBaseUrl, lastServedAt: new Date().toISOString(), counts });
}

export function getPlayHQEndpointUsage(): PlayHQEndpointUsage[] {
  return [...endpointUsage.values()].sort((a, b) => a.dataset.localeCompare(b.dataset));
}

// The v2 cricket paths recorded in earlier revisions have never returned data
// in production (every grade answers HTTP 404), so each fixture/ladder/summary
// read walks a candidate list and settles on whichever documented path the
// API actually serves. Only a 404 advances to the next candidate — any other
// failure propagates immediately.
async function playHQFetchFirst(paths: string[], dataset?: string) {
  let lastError: unknown;
  for (const path of paths) {
    try {
      const payload = await playHQFetch(path);
      if (dataset) recordEndpoint(dataset, path);
      return payload;
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || !/HTTP 404/.test(error.message)) throw error;
    }
  }
  throw lastError;
}

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
      // Tagged so "Refresh PlayHQ now" (lib/playhq/refresh.ts) also purges
      // the per-request data cache, not only the unstable_cache wrapper.
      next: { revalidate: Math.min(config.revalidateSeconds,300), tags: ['playhq'] },
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
  const path = endpoints.organisationSeasons(config.organisationId);
  const seasons = normaliseSeasons(await playHQFetch(path));
  recordEndpoint('Organisation seasons', path);
  return seasons;
}

export async function getPlayHQTeams(seasonId: string) {
  const path = endpoints.seasonTeams(seasonId);
  const teams = normaliseTeams(await playHQFetch(path));
  recordEndpoint('Season teams', path);
  return teams;
}

export async function getPlayHQGrades(seasonId: string) {
  const path = endpoints.seasonGrades(seasonId);
  const grades = normaliseGrades(await playHQFetch(path));
  recordEndpoint('Season grades', path);
  return grades;
}

export async function getPlayHQGradeFixtures(grade: PlayHQGrade) {
  return normaliseFixtures(await playHQFetchFirst([endpoints.cricketGradeFixture(grade.id), endpoints.gradeFixture(grade.id)], 'Grade fixture'), grade);
}

export async function getPlayHQGradeLadder(grade: PlayHQGrade) {
  return normaliseLadder(await playHQFetchFirst([endpoints.cricketGradeLadder(grade.id), endpoints.gradeLadder(grade.id)], 'Grade ladder'), grade);
}

export async function getPlayHQGameSummary(gameId: string) {
  return playHQFetchFirst([endpoints.cricketGameSummary(gameId), endpoints.gameSummary(gameId)], 'Game summary');
}

// Raw fixture payload for a grade. The fantasy importer needs the untouched
// round metadata that normaliseFixtures drops.
export async function getPlayHQGradeFixtureRaw(gradeId: string) {
  return playHQFetchFirst([endpoints.cricketGradeFixture(gradeId), endpoints.gradeFixture(gradeId)], 'Grade fixture');
}

// Raw fixture payload for a single team — the per-team feed is the reliable
// path for club organisations when grade-level fixture endpoints 404.
export async function getPlayHQTeamFixtureRaw(teamId: string) {
  const path = endpoints.teamFixture(teamId);
  const payload = await playHQFetch(path);
  recordEndpoint('Team fixture', path);
  return payload;
}

// Mapped mode: admin-saved seasons/grades/teams (lib/playhq/mapping.ts) drive
// discovery. Fixture and ladder reads mirror the automatic path below.
async function getMappedPublicData(
  mappings: PlayHQMappingSet,
  seasons: PlayHQSeason[],
  automaticSeasonIds: string[],
  fetchedAt: string,
  clubSeasonName: string | null | undefined,
): Promise<PlayHQPublicData> {
  const seasonIds = mappedSeasonIds(mappings, automaticSeasonIds);
  if (!seasonIds.length) return { configured: true, message: `Fixtures for ${clubSeasonName || 'the current season'} are not available here yet. Check the club on PlayHQ for the latest published information.`, fetchedAt, seasons, selectedSeasonId: null, teams: [], grades: [], fixtures: [], ladders: [], error: null, source: 'mapped' };

  const warnings: string[] = [];
  const discovered = await Promise.all(seasonIds.map(async (seasonId) => {
    const [teamResult, gradeResult] = await Promise.allSettled([getPlayHQTeams(seasonId), getPlayHQGrades(seasonId)]);
    if (teamResult.status === 'rejected') warnings.push(`Team discovery failed for a linked season: ${teamResult.reason instanceof Error ? teamResult.reason.message : 'unavailable'}`);
    return { seasonId, teams: teamResult.status === 'fulfilled' ? teamResult.value : [], grades: gradeResult.status === 'fulfilled' ? gradeResult.value : [] };
  }));
  const { teams, grades } = selectMappedScope(mappings, discovered);
  const mappedNames = new Set(teams.map((team) => team.name.trim().toLowerCase()));
  const fixturesByGrade = await Promise.all(grades.map(async (grade) => {
    const clubTeams = teams.filter((team) => team.gradeId === grade.id);
    try {
      if (clubTeams.length) {
        return (await Promise.all(clubTeams.map(async (team) => normaliseFixtures(await getPlayHQTeamFixtureRaw(team.id), grade).map((row) => ({ ...row, clubTeamIds: [team.id] }))))).flat();
      }
      return (await getPlayHQGradeFixtures(grade)).filter((row) => isClubTeamName(row.homeTeam) || isClubTeamName(row.awayTeam) || mappedNames.has(row.homeTeam.trim().toLowerCase()) || mappedNames.has(row.awayTeam.trim().toLowerCase()));
    } catch (error) { warnings.push(`Fixtures for ${grade.name}: ${error instanceof Error ? error.message : 'unavailable'}`); return []; }
  }));
  const laddersByGrade = await Promise.all(grades.map(async (grade) => {
    try { return await getPlayHQGradeLadder(grade); }
    catch (error) { warnings.push(`Ladder for ${grade.name}: ${error instanceof Error ? error.message : 'unavailable'}`); return []; }
  }));
  return {
    configured: true, fetchedAt, seasons, selectedSeasonId: seasonIds[0], teams, grades,
    fixtures: mergeFixtures(fixturesByGrade.flat()),
    ladders: laddersByGrade.flat().filter((row) => row.teamName.trim() && row.teamName !== 'Team'),
    warnings, error: null, source: 'mapped',
  };
}

export async function getPlayHQPublicDataUncached(): Promise<PlayHQPublicData> {
  const config = getPlayHQConfig();
  const fetchedAt = new Date().toISOString();
  if (!config.configured) {
    return { configured: false, message: 'Fixtures will appear once PlayHQ is configured.', fetchedAt, seasons: [], selectedSeasonId: null, teams: [], grades: [], fixtures: [], ladders: [], error: null };
  }

  try {
    const [seasons, clubSeason] = await Promise.all([getPlayHQSeasons(), getCurrentClubSeason()]);
    const configuredId = clubSeason?.playhq_season_id || config.defaultSeasonId;
    const currentSeasons = currentPublicSeasons(seasons, clubSeason?.slug, configuredId);
    // Saved admin mappings take over only once at least one row is enabled;
    // until then the automatic discovery below runs unchanged.
    const mappings = await loadPlayHQMappings(clubSeason?.id);
    if (hasActiveMappings(mappings)) return await getMappedPublicData(mappings, seasons, currentSeasons.map((season) => season.id).slice(0, 5), fetchedAt, clubSeason?.name);
    const preferredSeasonId = currentSeasons[0]?.id;
    if (!preferredSeasonId) return { configured: true, message: `Fixtures for ${clubSeason?.name || 'the current season'} are not available here yet. Check the club on PlayHQ for the latest published information.`, fetchedAt, seasons, selectedSeasonId: null, teams: [], grades: [], fixtures: [], ladders: [], error: null };

    // Organisations are often registered in several identically-named seasons
    // (one per competition). Discover club teams across the current season
    // candidates so all NDCC competitions are represented.
    const candidateIds = [preferredSeasonId, ...[...currentSeasons]
      .sort((a, b) => (Date.parse(b.startDate || '') || 0) - (Date.parse(a.startDate || '') || 0))
      .map((season) => season.id)
      .filter((id) => id !== preferredSeasonId)].slice(0, 5);

    const warnings: string[] = [];
    const discovered = await Promise.all(candidateIds.map(async candidateId => {
      const [teamResult,gradeResult]=await Promise.allSettled([getPlayHQTeams(candidateId),getPlayHQGrades(candidateId)]);
      const clubTeams=teamResult.status==='fulfilled'?teamResult.value.filter(team=>isClubTeamName(team.name)):[];
      if(teamResult.status==='rejected') warnings.push(`Team discovery failed for a current-season competition: ${teamResult.reason instanceof Error?teamResult.reason.message:'unavailable'}`);
      const gradeMap=new Map<string,PlayHQGrade>();
      for(const team of clubTeams) if(team.gradeId) gradeMap.set(team.gradeId,{id:team.gradeId,name:team.gradeName||team.gradeId,seasonId:candidateId});
      if(!gradeMap.size && gradeResult.status==='fulfilled') for(const grade of gradeResult.value) {
        if(config.defaultGradeIds.includes(grade.id))gradeMap.set(grade.id,{...grade,seasonId:candidateId});
      }
      return {teams:clubTeams,grades:[...gradeMap.values()]};
    }));
    const teams=[...new Map(discovered.flatMap(d=>d.teams).map(team=>[team.id,team])).values()];
    const allGrades=[...new Map(discovered.flatMap(d=>d.grades).map(grade=>[grade.id,grade])).values()];
    const grades=config.defaultGradeIds.length?allGrades.filter(g=>config.defaultGradeIds.includes(g.id)):allGrades;
    const fixturesByGrade=await Promise.all(grades.map(async grade=>{
      const clubTeams=teams.filter(team=>team.gradeId===grade.id);
      try {
        // The importer already uses the working club team feed. Use the same
        // source here instead of swallowing grade endpoint 404s as no fixtures.
        const rows=clubTeams.length
          ? (await Promise.all(clubTeams.map(async team=>normaliseFixtures(await getPlayHQTeamFixtureRaw(team.id),grade)))).flat()
          : await getPlayHQGradeFixtures(grade);
        return rows.filter(row=>isClubTeamName(row.homeTeam)||isClubTeamName(row.awayTeam));
      } catch(error) {warnings.push(`Fixtures for ${grade.name}: ${error instanceof Error?error.message:'unavailable'}`);return [];}
    }));
    const laddersByGrade=await Promise.all(grades.map(async grade=>{
      try {return await getPlayHQGradeLadder(grade);}
      catch(error) {warnings.push(`Ladder for ${grade.name}: ${error instanceof Error?error.message:'unavailable'}`);return [];}
    }));
    return {configured:true,fetchedAt,seasons,selectedSeasonId:preferredSeasonId,teams,grades,
      fixtures:[...new Map(fixturesByGrade.flat().map(f=>[f.id,f])).values()],
      ladders:laddersByGrade.flat().filter(row=>row.teamName.trim()&&row.teamName!=='Team'),warnings,error:null};
  } catch (error) {
    return { configured: true, message: 'PlayHQ data is temporarily unavailable.', fetchedAt, seasons: [], selectedSeasonId: null, teams: [], grades: [], fixtures: [], ladders: [], error: error instanceof Error ? error.message : 'Unknown PlayHQ error' };
  }
}

// unstable_cache options are fixed at module load, so read the configured TTL here
// rather than hardcoding it; getPlayHQConfig reads straight from process.env.
export const getPlayHQPublicData = unstable_cache(getPlayHQPublicDataUncached, ['playhq-public-data-current-season-v3'], { revalidate: Math.min(getPlayHQConfig().revalidateSeconds, 300), tags: ['playhq'] });
