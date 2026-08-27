/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { SEASON_COLUMNS } from '@/lib/fantasy-seasons';
import { getPlayHQSeasons } from '@/lib/playhq/client';
import { getPlayHQConfig } from '@/lib/playhq/config';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store', Vary: 'Cookie' } as const;
const SEASON_STATUSES = ['draft', 'upcoming', 'active', 'completed', 'archived'];

function forbidden() {
  return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403, headers: noStore });
}

export async function GET(request: Request) {
  const user = await requirePermission('fantasy.seasons');
  if (!user) return forbidden();
  const url = new URL(request.url);
  const supabase = createServerClient();
  try {
    const [{ data: seasons, error }, { data: gradeSources, error: gradeError }] = await Promise.all([
      supabase.from('fantasy_seasons').select(SEASON_COLUMNS).order('start_date', { ascending: false, nullsFirst: false }),
      supabase.from('fantasy_season_grade_sources').select('id, season_id, playhq_grade_id, grade_name, enabled, team_filter'),
    ]);
    if (error) throw new Error(error.message);
    if (gradeError) throw new Error(gradeError.message);

    let playhqSeasons: any[] = [];
    let playhqError: string | null = null;
    if (url.searchParams.get('discover') === '1') {
      if (getPlayHQConfig().configured) {
        try {
          playhqSeasons = await getPlayHQSeasons();
        } catch (err) {
          playhqError = err instanceof Error ? err.message : 'PlayHQ discovery failed.';
        }
      } else {
        playhqError = 'PlayHQ is not configured.';
      }
    }

    return NextResponse.json({ success: true, seasons, gradeSources, playhqSeasons, playhqError }, { headers: noStore });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not load seasons.' }, { status: 500, headers: noStore });
  }
}

export async function POST(request: Request) {
  const user = await requirePermission('fantasy.seasons');
  if (!user) return forbidden();
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const slug = String(body.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!name || !slug) return NextResponse.json({ success: false, error: 'Season name and slug are required.' }, { status: 400, headers: noStore });
  const status = SEASON_STATUSES.includes(body.status) ? body.status : 'draft';

  const supabase = createServerClient();
  const insert = {
    name,
    slug,
    status,
    playhq_season_id: String(body.playhqSeasonId || '').trim() || null,
    start_date: body.startDate || null,
    end_date: body.endDate || null,
    is_public: body.isPublic === true,
    allow_team_building: body.allowTeamBuilding === true,
    registration_open: body.registrationOpen === true,
    team_selection_open: body.teamSelectionOpen === true,
    is_current: false,
  };
  const { data: season, error } = await supabase.from('fantasy_seasons').insert(insert).select(SEASON_COLUMNS).single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400, headers: noStore });

  const { error: settingsError } = await supabase.from('fantasy_settings').insert({
    season_name: name,
    season_id: season.id,
    is_registration_open: insert.registration_open,
    is_team_selection_open: insert.team_selection_open,
  });
  if (settingsError) return NextResponse.json({ success: false, error: `Season created, but settings row failed: ${settingsError.message}` }, { status: 500, headers: noStore });
  return NextResponse.json({ success: true, season }, { headers: noStore });
}

export async function PATCH(request: Request) {
  const user = await requirePermission('fantasy.seasons');
  if (!user) return forbidden();
  const body = await request.json().catch(() => ({}));
  const seasonId = String(body.seasonId || '').trim();
  if (!seasonId) return NextResponse.json({ success: false, error: 'seasonId is required.' }, { status: 400, headers: noStore });

  const supabase = createServerClient();
  const update: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim();
  if (typeof body.status === 'string' && SEASON_STATUSES.includes(body.status)) {
    update.status = body.status;
    if (body.status === 'completed' || body.status === 'archived') update.auto_sync_enabled = false;
  }
  if (typeof body.playhqSeasonId === 'string') update.playhq_season_id = body.playhqSeasonId.trim() || null;
  if (body.startDate !== undefined) update.start_date = body.startDate || null;
  if (body.endDate !== undefined) update.end_date = body.endDate || null;
  for (const [key, column] of [['isPublic', 'is_public'], ['autoSyncEnabled', 'auto_sync_enabled'], ['allowTeamBuilding', 'allow_team_building'], ['registrationOpen', 'registration_open'], ['teamSelectionOpen', 'team_selection_open']] as const) {
    if (typeof body[key] === 'boolean') update[column] = body[key];
  }

  if (body.isCurrent === true) {
    const { error: clearError } = await supabase.from('fantasy_seasons').update({ is_current: false }).eq('is_current', true).neq('id', seasonId);
    if (clearError) return NextResponse.json({ success: false, error: clearError.message }, { status: 500, headers: noStore });
    update.is_current = true;
  }

  if (!Object.keys(update).length) return NextResponse.json({ success: false, error: 'No supported season fields were provided.' }, { status: 400, headers: noStore });
  const { data: season, error } = await supabase.from('fantasy_seasons').update(update).eq('id', seasonId).select(SEASON_COLUMNS).single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400, headers: noStore });
  return NextResponse.json({ success: true, season }, { headers: noStore });
}
