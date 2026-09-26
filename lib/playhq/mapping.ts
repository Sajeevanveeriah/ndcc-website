// Pure selection logic for admin-saved PlayHQ mappings (no I/O).
// Unit tested in scripts/test-playhq-mapping.mjs against recorded fixtures.
//
// When no enabled mapping row exists for the current club season the public
// feed keeps its automatic discovery (lib/playhq/client.ts). Once rows exist:
// - linked PlayHQ seasons replace the automatic season candidates;
// - enabled team mappings replace name-based NDCC team discovery;
// - enabled grade mappings replace the grades derived from those teams.
// Each list falls back independently, so saving only team links still works.
import { isClubTeamName } from './season-match';
import type { PlayHQFixture, PlayHQGrade, PlayHQTeam } from './types';

const PLAYHQ_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPlayHQUuid(value: unknown): value is string {
  return typeof value === 'string' && PLAYHQ_UUID_PATTERN.test(value.trim());
}

export type PlayHQSeasonLink = { playhqSeasonId: string; label: string | null; enabled: boolean };
export type PlayHQGradeMapping = { playhqGradeId: string; gradeName: string; enabled: boolean };
export type PlayHQTeamMapping = { playhqTeamId: string; teamName: string; playhqGradeId: string | null; enabled: boolean };
export type PlayHQMappingSet = {
  clubSeasonId: string;
  seasons: PlayHQSeasonLink[];
  grades: PlayHQGradeMapping[];
  teams: PlayHQTeamMapping[];
};

export type DiscoveredSeason = { seasonId: string; teams: PlayHQTeam[]; grades: PlayHQGrade[] };

export function hasActiveMappings(mappings: PlayHQMappingSet | null | undefined): mappings is PlayHQMappingSet {
  if (!mappings) return false;
  return mappings.seasons.some((row) => row.enabled)
    || mappings.grades.some((row) => row.enabled)
    || mappings.teams.some((row) => row.enabled);
}

/** Linked seasons win; otherwise the automatic current-season candidates. */
export function mappedSeasonIds(mappings: PlayHQMappingSet, automaticIds: string[]): string[] {
  const linked = [...new Set(mappings.seasons.filter((row) => row.enabled).map((row) => row.playhqSeasonId))];
  return linked.length ? linked : [...new Set(automaticIds)];
}

export function selectMappedScope(mappings: PlayHQMappingSet, discovered: DiscoveredSeason[]): { teams: PlayHQTeam[]; grades: PlayHQGrade[] } {
  const liveTeams = new Map<string, PlayHQTeam>();
  const teamSeason = new Map<string, string>();
  const liveGrades = new Map<string, PlayHQGrade>();
  for (const season of discovered) {
    for (const team of season.teams) {
      if (!liveTeams.has(team.id)) { liveTeams.set(team.id, team); teamSeason.set(team.id, season.seasonId); }
    }
    for (const grade of season.grades) {
      if (!liveGrades.has(grade.id)) liveGrades.set(grade.id, { ...grade, seasonId: grade.seasonId || season.seasonId });
    }
  }
  const mappedGradeName = (gradeId: string | null | undefined) => (gradeId ? mappings.grades.find((row) => row.playhqGradeId === gradeId)?.gradeName : undefined);

  const enabledTeams = mappings.teams.filter((row) => row.enabled);
  const teams: PlayHQTeam[] = enabledTeams.length
    ? enabledTeams.map((row) => {
      const live = liveTeams.get(row.playhqTeamId);
      // A grade allocated by GCA after the mapping was saved shows up live.
      const gradeId = live?.gradeId || row.playhqGradeId || null;
      const gradeName = gradeId ? (live?.gradeName || liveGrades.get(gradeId)?.name || mappedGradeName(gradeId) || null) : null;
      return { id: row.playhqTeamId, name: live?.name || row.teamName, gradeId, gradeName };
    })
    : [...new Map(discovered.flatMap((season) => season.teams.filter((team) => isClubTeamName(team.name))).map((team) => [team.id, team])).values()];

  const seasonForGrade = (gradeId: string) => {
    const team = teams.find((row) => row.gradeId === gradeId);
    return liveGrades.get(gradeId)?.seasonId || (team ? teamSeason.get(team.id) : undefined) || null;
  };

  const enabledGrades = mappings.grades.filter((row) => row.enabled);
  const grades: PlayHQGrade[] = enabledGrades.length
    ? enabledGrades.map((row) => ({ id: row.playhqGradeId, name: row.gradeName || liveGrades.get(row.playhqGradeId)?.name || row.playhqGradeId, seasonId: seasonForGrade(row.playhqGradeId) }))
    : [...new Map(teams.filter((team) => team.gradeId).map((team) => [team.gradeId as string, {
      id: team.gradeId as string,
      name: team.gradeName || liveGrades.get(team.gradeId as string)?.name || (team.gradeId as string),
      seasonId: seasonForGrade(team.gradeId as string),
    }])).values()];

  return { teams: [...new Map(teams.map((team) => [team.id, team])).values()], grades: [...new Map(grades.map((grade) => [grade.id, grade])).values()] };
}

/** Merge duplicate games (two NDCC teams can meet in one grade) without losing team tags. */
export function mergeFixtures(rows: PlayHQFixture[]): PlayHQFixture[] {
  const merged = new Map<string, PlayHQFixture>();
  for (const row of rows) {
    const existing = merged.get(row.id);
    if (!existing) { merged.set(row.id, { ...row, ...(row.clubTeamIds ? { clubTeamIds: [...row.clubTeamIds] } : {}) }); continue; }
    const ids = [...new Set([...(existing.clubTeamIds || []), ...(row.clubTeamIds || [])])];
    merged.set(row.id, { ...existing, ...row, ...(ids.length ? { clubTeamIds: ids } : {}) });
  }
  return [...merged.values()];
}

type Row = Record<string, unknown>;
function str(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }

export type PlayHQMappingSaveInput = {
  seasons: PlayHQSeasonLink[];
  grades: PlayHQGradeMapping[];
  teams: PlayHQTeamMapping[];
  cmsTeamLinks: Array<{ teamId: string; playhqTeamId: string | null }>;
};

function cleanLabel(value: unknown, max = 200) {
  return str(value).replace(/\s+/g, ' ').slice(0, max);
}

/** Validate an admin payload. Only full PlayHQ UUIDs are accepted. */
export function parsePlayHQMappingPayload(body: unknown): { ok: true; value: PlayHQMappingSaveInput } | { ok: false; error: string } {
  const root = (body && typeof body === 'object' ? body : {}) as Row;
  const list = (key: string) => (Array.isArray(root[key]) ? root[key] as Row[] : []);
  if (list('seasons').length > 20 || list('grades').length > 60 || list('teams').length > 60 || list('cmsTeamLinks').length > 100) {
    return { ok: false, error: 'Too many mappings in one save.' };
  }
  const seasons: PlayHQSeasonLink[] = [];
  for (const row of list('seasons')) {
    if (!isPlayHQUuid(row.playhqSeasonId)) return { ok: false, error: 'Each linked season needs a full PlayHQ season id.' };
    seasons.push({ playhqSeasonId: str(row.playhqSeasonId).toLowerCase(), label: cleanLabel(row.label) || null, enabled: row.enabled !== false });
  }
  const grades: PlayHQGradeMapping[] = [];
  for (const row of list('grades')) {
    if (!isPlayHQUuid(row.playhqGradeId)) return { ok: false, error: 'Each linked grade needs a full PlayHQ grade id.' };
    const gradeName = cleanLabel(row.gradeName);
    if (!gradeName) return { ok: false, error: 'Each linked grade needs its PlayHQ grade name.' };
    grades.push({ playhqGradeId: str(row.playhqGradeId).toLowerCase(), gradeName, enabled: row.enabled !== false });
  }
  const teams: PlayHQTeamMapping[] = [];
  for (const row of list('teams')) {
    if (!isPlayHQUuid(row.playhqTeamId)) return { ok: false, error: 'Each linked team needs a full PlayHQ team id.' };
    const teamName = cleanLabel(row.teamName);
    if (!teamName) return { ok: false, error: 'Each linked team needs its PlayHQ team name.' };
    const gradeId = row.playhqGradeId == null || row.playhqGradeId === '' ? null : row.playhqGradeId;
    if (gradeId !== null && !isPlayHQUuid(gradeId)) return { ok: false, error: 'A linked team has an invalid PlayHQ grade id.' };
    teams.push({ playhqTeamId: str(row.playhqTeamId).toLowerCase(), teamName, playhqGradeId: gradeId ? str(gradeId).toLowerCase() : null, enabled: row.enabled !== false });
  }
  const cmsTeamLinks: PlayHQMappingSaveInput['cmsTeamLinks'] = [];
  for (const row of list('cmsTeamLinks')) {
    const teamId = str(row.teamId);
    if (!teamId || teamId.length > 64) return { ok: false, error: 'A CMS team link is missing its team.' };
    const playhqTeamId = row.playhqTeamId == null || row.playhqTeamId === '' ? null : row.playhqTeamId;
    if (playhqTeamId !== null && !isPlayHQUuid(playhqTeamId)) return { ok: false, error: 'A CMS team link has an invalid PlayHQ team id.' };
    cmsTeamLinks.push({ teamId, playhqTeamId: playhqTeamId ? str(playhqTeamId).toLowerCase() : null });
  }
  const unique = <T,>(rows: T[], key: (row: T) => string) => new Set(rows.map(key)).size === rows.length;
  if (!unique(seasons, (row) => row.playhqSeasonId) || !unique(grades, (row) => row.playhqGradeId) || !unique(teams, (row) => row.playhqTeamId) || !unique(cmsTeamLinks, (row) => row.teamId)) {
    return { ok: false, error: 'Each PlayHQ season, grade, team and CMS team may appear only once.' };
  }
  return { ok: true, value: { seasons, grades, teams, cmsTeamLinks } };
}
