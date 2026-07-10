/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { FANTASY_ADMIN_ROLES } from '@/lib/auth/config';
import { createServerClient } from '@/lib/supabase-server';
import { getPlayHQGrades } from '@/lib/playhq/client';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store', Vary: 'Cookie' } as const;

// GET: current grade sources for the season plus live PlayHQ grades for its
// linked PlayHQ season. PUT: replace the enabled grade mapping.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await requireSession(FANTASY_ADMIN_ROLES);
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403, headers: noStore });
  const supabase = createServerClient();
  try {
    const { data: season, error: seasonError } = await supabase.from('fantasy_seasons').select('id, name, playhq_season_id').eq('id', params.id).maybeSingle();
    if (seasonError) throw new Error(seasonError.message);
    if (!season) return NextResponse.json({ success: false, error: 'Season not found.' }, { status: 404, headers: noStore });

    const { data: sources, error: sourceError } = await supabase
      .from('fantasy_season_grade_sources')
      .select('id, playhq_grade_id, grade_name, enabled, team_filter')
      .eq('season_id', season.id)
      .order('grade_name');
    if (sourceError) throw new Error(sourceError.message);

    let playhqGrades: any[] = [];
    let playhqError: string | null = null;
    if (season.playhq_season_id) {
      try {
        playhqGrades = await getPlayHQGrades(season.playhq_season_id);
      } catch (err) {
        playhqError = err instanceof Error ? err.message : 'PlayHQ grade discovery failed.';
      }
    }
    return NextResponse.json({ success: true, season, sources, playhqGrades, playhqError }, { headers: noStore });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not load grade sources.' }, { status: 500, headers: noStore });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const user = await requireSession(FANTASY_ADMIN_ROLES);
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403, headers: noStore });
  const body = await request.json().catch(() => ({}));
  const grades = Array.isArray(body.grades) ? body.grades : [];
  const supabase = createServerClient();
  try {
    for (const grade of grades) {
      const playhqGradeId = String(grade.playhqGradeId || '').trim();
      const gradeName = String(grade.gradeName || '').trim();
      if (!playhqGradeId || !gradeName) continue;
      const row = {
        season_id: params.id,
        playhq_grade_id: playhqGradeId,
        grade_name: gradeName,
        enabled: grade.enabled !== false,
        team_filter: String(grade.teamFilter || '').trim() || null,
      };
      const { error } = await supabase.from('fantasy_season_grade_sources').upsert(row, { onConflict: 'season_id,playhq_grade_id' });
      if (error) throw new Error(error.message);
    }
    const { data: sources, error: reloadError } = await supabase
      .from('fantasy_season_grade_sources')
      .select('id, playhq_grade_id, grade_name, enabled, team_filter')
      .eq('season_id', params.id)
      .order('grade_name');
    if (reloadError) throw new Error(reloadError.message);
    return NextResponse.json({ success: true, sources }, { headers: noStore });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not save grade sources.' }, { status: 500, headers: noStore });
  }
}
