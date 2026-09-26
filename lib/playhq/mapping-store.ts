import 'server-only';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { isPlayHQUuid, type PlayHQMappingSaveInput, type PlayHQMappingSet } from './mapping';

// Supabase persistence for admin PlayHQ mappings. Every read degrades to "no
// mappings" (automatic discovery) when a table or column is missing, e.g.
// before 20260927070000_playhq_season_links.sql is applied.

type Row = Record<string, unknown>;

function str(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }

export async function loadPlayHQMappings(clubSeasonId: string | null | undefined): Promise<PlayHQMappingSet | null> {
  if (!clubSeasonId || !isServerSupabaseConfigured()) return null;
  try {
    const supabase = createServerClient();
    const [seasons, grades, teams] = await Promise.all([
      supabase.from('club_season_playhq_seasons').select('playhq_season_id, label, enabled, sort_order').eq('club_season_id', clubSeasonId).order('sort_order', { ascending: true }),
      supabase.from('club_season_playhq_grade_mappings').select('playhq_grade_id, grade_name, enabled').eq('club_season_id', clubSeasonId),
      supabase.from('club_season_playhq_team_mappings').select('playhq_team_id, team_name, playhq_grade_id, enabled').eq('club_season_id', clubSeasonId),
    ]);
    if (seasons.error) console.warn('[playhq] Season links unavailable; using automatic seasons:', seasons.error.message);
    if (grades.error) console.warn('[playhq] Grade mappings unavailable:', grades.error.message);
    if (teams.error) console.warn('[playhq] Team mappings unavailable:', teams.error.message);
    return {
      clubSeasonId,
      seasons: ((seasons.error ? [] : seasons.data) as Row[] || []).filter((row) => isPlayHQUuid(row.playhq_season_id)).map((row) => ({
        playhqSeasonId: str(row.playhq_season_id), label: str(row.label) || null, enabled: row.enabled !== false,
      })),
      grades: ((grades.error ? [] : grades.data) as Row[] || []).filter((row) => isPlayHQUuid(row.playhq_grade_id)).map((row) => ({
        playhqGradeId: str(row.playhq_grade_id), gradeName: str(row.grade_name), enabled: row.enabled !== false,
      })),
      teams: ((teams.error ? [] : teams.data) as Row[] || []).filter((row) => isPlayHQUuid(row.playhq_team_id)).map((row) => ({
        playhqTeamId: str(row.playhq_team_id), teamName: str(row.team_name), playhqGradeId: isPlayHQUuid(row.playhq_grade_id) ? str(row.playhq_grade_id) : null, enabled: row.enabled !== false,
      })),
    };
  } catch (error) {
    console.warn('[playhq] Mappings unavailable; using automatic discovery:', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

/** CMS team id -> linked PlayHQ team id. Empty when the column is not deployed. */
export async function loadTeamPlayHQLinks(): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  if (!isServerSupabaseConfigured()) return links;
  try {
    const { data, error } = await createServerClient({ publicReadCache: true }).from('teams').select('id, playhq_team_id').not('playhq_team_id', 'is', null);
    if (error) return links;
    for (const row of (data || []) as Row[]) {
      if (str(row.id) && isPlayHQUuid(row.playhq_team_id)) links.set(str(row.id), str(row.playhq_team_id).toLowerCase());
    }
  } catch {
    // Missing column or transient outage: team pages fall back to name matching.
  }
  return links;
}

async function replaceRows(table: string, clubSeasonId: string, idColumn: string, rows: Row[]) {
  const supabase = createServerClient();
  const keep = rows.map((row) => String(row[idColumn]));
  const existing = await supabase.from(table).select(idColumn).eq('club_season_id', clubSeasonId);
  if (existing.error) throw new Error(existing.error.message);
  const stale = ((existing.data || []) as unknown as Row[]).map((row) => String(row[idColumn])).filter((id) => !keep.includes(id));
  if (stale.length) {
    const removed = await supabase.from(table).delete().eq('club_season_id', clubSeasonId).in(idColumn, stale);
    if (removed.error) throw new Error(removed.error.message);
  }
  if (rows.length) {
    const saved = await supabase.from(table).upsert(rows.map((row) => ({ ...row, club_season_id: clubSeasonId })), { onConflict: `club_season_id,${idColumn}` });
    if (saved.error) throw new Error(saved.error.message);
  }
}

/** Replace the club season's mapping set and CMS team links. */
export async function savePlayHQMappings(clubSeasonId: string, input: PlayHQMappingSaveInput, cmsTeamIds: string[]) {
  const warnings: string[] = [];
  try {
    await replaceRows('club_season_playhq_seasons', clubSeasonId, 'playhq_season_id', input.seasons.map((row, index) => ({ playhq_season_id: row.playhqSeasonId, label: row.label, enabled: row.enabled, sort_order: index })));
  } catch (error) {
    if (input.seasons.length) throw new Error(`Season links could not be saved (${error instanceof Error ? error.message : 'unknown'}). The database migration 20260927070000_playhq_season_links.sql may not be applied yet.`);
    warnings.push('Season links table is not available yet; seasons were not changed.');
  }
  await replaceRows('club_season_playhq_grade_mappings', clubSeasonId, 'playhq_grade_id', input.grades.map((row) => ({ playhq_grade_id: row.playhqGradeId, grade_name: row.gradeName, enabled: row.enabled })));
  await replaceRows('club_season_playhq_team_mappings', clubSeasonId, 'playhq_team_id', input.teams.map((row) => ({ playhq_team_id: row.playhqTeamId, team_name: row.teamName, playhq_grade_id: row.playhqGradeId, enabled: row.enabled })));

  const supabase = createServerClient();
  for (const link of input.cmsTeamLinks) {
    if (!cmsTeamIds.includes(link.teamId)) throw new Error('A CMS team link refers to an unknown team.');
    const result = await supabase.from('teams').update({ playhq_team_id: link.playhqTeamId }).eq('id', link.teamId);
    if (result.error) {
      throw new Error(`CMS team links could not be saved (${result.error.message}). The database migration 20260927070000_playhq_season_links.sql may not be applied yet.`);
    }
  }
  return { warnings };
}
