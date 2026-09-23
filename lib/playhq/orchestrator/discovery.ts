/* eslint-disable @typescript-eslint/no-explicit-any */
// Season discovery/linking and grade discovery/mapping steps of the fantasy PlayHQ orchestrator.
// Split out of lib/playhq/fantasy-orchestrator.ts (which re-exports the public API).
import 'server-only';
import { getPlayHQGrades, getPlayHQSeasons, getPlayHQTeams } from '../client';
import { isClubTeamName, matchPlayHQSeason } from '../season-match';
import { type RunLog, type SeasonRow, setSeasonException } from './shared';

/** When several identically-named seasons match the year pair (organisations
 *  are registered once per competition), probe each candidate's team list and
 *  keep only seasons that actually contain NDCC teams. Deterministic evidence
 *  from the official API — never a guess. */
export async function disambiguateByClubTeams(candidates: Array<{ id: string; name: string; competitionName?: string | null }>) {
  const probed: Array<{ id: string; name: string; competitionName: string | null; clubTeams: string[]; teamsSeen: number }> = [];
  for (const candidate of candidates.slice(0, 8)) {
    let teams: Array<{ name: string }> = [];
    try {
      teams = await getPlayHQTeams(candidate.id);
    } catch {
      // A candidate whose teams endpoint fails cannot be verified; keep it
      // out of the survivor set but record the probe.
    }
    const clubTeams = teams.filter((team) => isClubTeamName(team.name)).map((team) => team.name);
    probed.push({ id: candidate.id, name: candidate.name, competitionName: candidate.competitionName ?? null, clubTeams, teamsSeen: teams.length });
  }
  return { probed, survivors: probed.filter((candidate) => candidate.clubTeams.length > 0) };
}

/** Link a fantasy season to its PlayHQ season by normalised years + dates.
 *  Never overwrites a different existing id — that becomes a blocking
 *  exception for an admin to resolve. */
export async function discoverAndLinkSeason(supabase: any, season: SeasonRow): Promise<RunLog> {
  const playhqSeasons = await getPlayHQSeasons();
  if (!playhqSeasons.length) {
    return { seasonSlug: season.slug, stage: 'discover_season', status: 'error', error: 'PlayHQ returned no seasons for the organisation (kept previous state).' };
  }
  let match = matchPlayHQSeason(playhqSeasons, { slug: season.slug, name: season.name });
  // Every NDCC-containing competition counts for fantasy (owner decision,
  // 2026-07-15): Mens, Womens, T20 and Juniors are all ingested. The primary
  // link is the competition with the most NDCC teams (deterministic
  // tiebreak); every surviving competition is recorded as a grade source
  // discovery target.
  let sources: Array<{ id: string; name: string; competitionName: string | null; clubTeams: string[] }> = [];
  if (match.status === 'ambiguous') {
    const { probed, survivors } = await disambiguateByClubTeams(match.candidates);
    if (survivors.length === 0) {
      const probeEvidence = probed
        .map((candidate) => `${candidate.name}${candidate.competitionName ? ` / ${candidate.competitionName}` : ''} (${candidate.id}): 0 NDCC team(s) of ${candidate.teamsSeen}`)
        .join('; ');
      return {
        seasonSlug: season.slug,
        stage: 'discover_season',
        status: 'blocked',
        detail: { evidence: match.evidence, probe: probeEvidence },
        error: `None of the ${probed.length} candidate seasons contain NDCC teams. Probe: ${probeEvidence}.`,
      };
    }
    const ranked = [...survivors].sort((a, b) => b.clubTeams.length - a.clubTeams.length || (a.competitionName ?? a.name).localeCompare(b.competitionName ?? b.name) || a.id.localeCompare(b.id));
    sources = ranked;
    const primary = ranked[0];
    match = {
      status: 'matched',
      season: match.candidates.find((candidate) => candidate.id === primary.id)!,
      evidence: `${match.evidence} Team probe kept ${ranked.length} NDCC-containing competition(s): ${ranked
        .map((candidate) => `${candidate.competitionName ?? candidate.name} (${candidate.clubTeams.length} NDCC teams)`)
        .join('; ')}. Primary link: ${primary.competitionName ?? primary.name} (${primary.id}).`,
    };
  }
  if (match.status !== 'matched') {
    return {
      seasonSlug: season.slug,
      stage: 'discover_season',
      status: 'skipped',
      detail: { evidence: match.evidence },
    };
  }
  if (!sources.length) {
    sources = [{ id: match.season.id, name: match.season.name, competitionName: match.season.competitionName ?? null, clubTeams: [] }];
  }
  if (season.playhq_season_id && season.playhq_season_id !== match.season.id) {
    const message = `Discovered PlayHQ season ${match.season.id} conflicts with stored ${season.playhq_season_id}. Resolve manually.`;
    await setSeasonException(supabase, season.id, message);
    return { seasonSlug: season.slug, stage: 'link_season', status: 'blocked', error: message };
  }
  const { error } = await supabase
    .from('fantasy_seasons')
    .update({
      playhq_season_id: match.season.id,
      playhq_linked_at: new Date().toISOString(),
      playhq_discovery: {
        evidence: match.evidence,
        playhq_name: match.season.name,
        start_date: match.season.startDate ?? null,
        end_date: match.season.endDate ?? null,
        discovered_at: new Date().toISOString(),
        sources: sources.map((source) => ({ id: source.id, name: source.name, competitionName: source.competitionName, clubTeams: source.clubTeams })),
      },
      sync_exception: null,
    })
    .eq('id', season.id);
  if (error) return { seasonSlug: season.slug, stage: 'link_season', status: 'error', error: error.message };
  season.playhq_season_id = match.season.id;
  season.playhq_discovery = { sources };
  return { seasonSlug: season.slug, stage: 'link_season', status: 'ok', detail: { playhq_season_id: match.season.id, source_count: sources.length, evidence: match.evidence } };
}

/** Discover the grades containing NDCC teams across every discovered PlayHQ
 *  source season and persist any missing grade sources. Existing rows
 *  (including admin-disabled ones) are never changed. Grade names come from
 *  the grades endpoint when it answers and fall back to the grade name
 *  carried on the team records (some club-scoped seasons return teams but an
 *  empty grades collection). */
export async function discoverAndMapGrades(supabase: any, season: SeasonRow): Promise<RunLog> {
  const sourceIds = Array.from(new Set([
    season.playhq_season_id as string,
    ...(season.playhq_discovery?.sources ?? []).map((source) => source.id),
  ].filter(Boolean)));

  const clubGrades = new Map<string, { name: string; playhqSeasonId: string; teams: string[] }>();
  const excluded: string[] = [];
  let teamsSeen = 0;
  for (const sourceId of sourceIds.slice(0, 8)) {
    const [teams, grades] = await Promise.all([
      getPlayHQTeams(sourceId).catch(() => []),
      getPlayHQGrades(sourceId).catch(() => []),
    ]);
    teamsSeen += teams.length;
    const gradeNames = new Map(grades.map((grade: { id: string; name: string }) => [grade.id, grade.name]));
    for (const team of teams as Array<{ name: string; gradeId?: string | null; gradeName?: string | null }>) {
      if (!team.gradeId) continue;
      if (!isClubTeamName(team.name)) {
        excluded.push(team.name);
        continue;
      }
      const entry = clubGrades.get(team.gradeId) ?? {
        name: gradeNames.get(team.gradeId) ?? team.gradeName ?? team.gradeId,
        playhqSeasonId: sourceId,
        teams: [],
      };
      entry.teams.push(team.name);
      clubGrades.set(team.gradeId, entry);
    }
  }
  if (clubGrades.size === 0) {
    return {
      seasonSlug: season.slug,
      stage: 'discover_grades',
      status: 'skipped',
      detail: { reason: 'No NDCC teams found in any discovered PlayHQ source season.', teams_seen: teamsSeen, sources: sourceIds },
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from('fantasy_season_grade_sources')
    .select('playhq_grade_id')
    .eq('season_id', season.id);
  if (existingError) return { seasonSlug: season.slug, stage: 'discover_grades', status: 'error', error: existingError.message };
  const existingIds = new Set((existing ?? []).map((row: { playhq_grade_id: string }) => row.playhq_grade_id));

  const inserts = Array.from(clubGrades.entries())
    .filter(([gradeId]) => !existingIds.has(gradeId))
    .map(([gradeId, meta]) => ({
      season_id: season.id,
      playhq_grade_id: gradeId,
      grade_name: meta.name,
      playhq_season_id: meta.playhqSeasonId,
      enabled: true,
      team_filter: 'newcomb',
    }));
  if (inserts.length) {
    const { error } = await supabase.from('fantasy_season_grade_sources').insert(inserts);
    if (error) return { seasonSlug: season.slug, stage: 'map_grades', status: 'error', error: error.message };
  }
  return {
    seasonSlug: season.slug,
    stage: 'map_grades',
    status: 'ok',
    detail: {
      discovered: clubGrades.size,
      inserted: inserts.length,
      preserved_existing: existingIds.size,
      source_seasons: sourceIds.length,
      grades: Array.from(clubGrades.entries()).map(([gradeId, meta]) => ({
        grade_id: gradeId,
        grade_name: meta.name,
        playhq_season_id: meta.playhqSeasonId,
        matched_teams: meta.teams,
      })),
      excluded_team_sample: excluded.slice(0, 8),
    },
  };
}
