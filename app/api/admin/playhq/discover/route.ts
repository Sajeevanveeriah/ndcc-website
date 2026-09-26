import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { getCurrentClubSeason } from '@/lib/club-seasons';
import { getPlayHQGrades, getPlayHQSeasons, getPlayHQTeams } from '@/lib/playhq/client';
import { getPlayHQConfig } from '@/lib/playhq/config';
import { isPlayHQUuid } from '@/lib/playhq/mapping';
import { currentPublicSeasons, isClubTeamName } from '@/lib/playhq/season-match';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store', Vary: 'Cookie' } as const;
const MAX_SEASONS = 6;

// Server-side discovery for /admin/season/playhq. Uses the existing PlayHQ
// client, so the API key never leaves the server.
export async function GET(request: Request) {
  const user = await requirePermission('season.setup');
  if (!user) return NextResponse.json({ success: false, error: 'Your account does not have access to this section.' }, { status: 403, headers: noStore });
  const config = getPlayHQConfig();
  if (!config.configured) return NextResponse.json({ success: false, error: 'PlayHQ is not configured on the server.' }, { status: 409, headers: noStore });

  try {
    const [seasons, clubSeason] = await Promise.all([getPlayHQSeasons(), getCurrentClubSeason().catch(() => null)]);
    const current = currentPublicSeasons(seasons, clubSeason?.slug, clubSeason?.playhq_season_id || config.defaultSeasonId).map((season) => season.id);
    const known = new Set(seasons.map((season) => season.id));
    const requested = (new URL(request.url).searchParams.get('seasonIds') || '').split(',').map((id) => id.trim().toLowerCase()).filter(Boolean);
    if (requested.some((id) => !isPlayHQUuid(id) || !known.has(id))) {
      return NextResponse.json({ success: false, error: 'Choose seasons from the discovered PlayHQ list.' }, { status: 400, headers: noStore });
    }
    const selected = [...new Set(requested.length ? requested : current)].slice(0, MAX_SEASONS);

    const details = await Promise.all(selected.map(async (seasonId) => {
      const [teamResult, gradeResult] = await Promise.allSettled([getPlayHQTeams(seasonId), getPlayHQGrades(seasonId)]);
      const allTeams = teamResult.status === 'fulfilled' ? teamResult.value : [];
      const clubTeams = allTeams.filter((team) => isClubTeamName(team.name));
      const clubGradeIds = new Set(clubTeams.map((team) => team.gradeId).filter(Boolean));
      const grades = gradeResult.status === 'fulfilled' ? gradeResult.value : [];
      // Grades that only appear on club teams (not in the grade list) still show.
      for (const team of clubTeams) {
        if (team.gradeId && !grades.some((grade) => grade.id === team.gradeId)) grades.push({ id: team.gradeId, name: team.gradeName || team.gradeId, seasonId });
      }
      return {
        seasonId,
        clubTeams: clubTeams.map((team) => ({ id: team.id, name: team.name, gradeId: team.gradeId || null, gradeName: team.gradeName || null })),
        grades: grades.map((grade) => ({ id: grade.id, name: grade.name, hasClubTeam: clubGradeIds.has(grade.id) }))
          .sort((a, b) => Number(b.hasClubTeam) - Number(a.hasClubTeam) || a.name.localeCompare(b.name)),
        errors: [
          ...(teamResult.status === 'rejected' ? [`Teams: ${teamResult.reason instanceof Error ? teamResult.reason.message : 'unavailable'}`] : []),
          ...(gradeResult.status === 'rejected' ? [`Grades: ${gradeResult.reason instanceof Error ? gradeResult.reason.message : 'unavailable'}`] : []),
        ],
      };
    }));

    return NextResponse.json({
      success: true,
      seasons: seasons
        .map((season) => ({ ...season, current: current.includes(season.id) }))
        .sort((a, b) => Number(b.current) - Number(a.current) || (Date.parse(b.startDate || '') || 0) - (Date.parse(a.startDate || '') || 0)),
      selectedSeasonIds: selected,
      details,
    }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'PlayHQ discovery failed.' }, { status: 502, headers: noStore });
  }
}
