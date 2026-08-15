import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { CLUB_SEASON_COLUMNS, nextClubSeasonDraft } from '@/lib/club-seasons';
import { buildSeasonWizardPreview, validateSeasonWizardPayload } from '@/lib/club-season-wizard';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store', Vary: 'Cookie' } as const;

export async function GET() {
  const user = await requirePermission('season.setup');
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403, headers: noStore });
  const supabase = createServerClient();
  const [{ data: seasons, error: seasonsError }, { data: states, error: statesError }] = await Promise.all([
    supabase.from('club_seasons').select(CLUB_SEASON_COLUMNS).order('start_date', { ascending: false }),
    supabase.from('club_season_wizard_states').select('*').neq('status', 'cancelled').order('updated_at', { ascending: false }).limit(10),
  ]);
  if (seasonsError || statesError) return NextResponse.json({ success: false, error: seasonsError?.message || statesError?.message }, { status: 500, headers: noStore });
  const currentSeason = (seasons || []).find((season) => season.is_current) || seasons?.[0] || null;
  return NextResponse.json({ success: true, seasons, states, suggestedSeason: nextClubSeasonDraft(currentSeason) }, { headers: noStore });
}

export async function POST(request: Request) {
  const user = await requirePermission('season.setup');
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403, headers: noStore });
  const body = await request.json().catch(() => ({}));
  const idempotencyKey = String(body.idempotencyKey || '').trim();
  if (!idempotencyKey) return NextResponse.json({ success: false, error: 'idempotencyKey is required.' }, { status: 400, headers: noStore });
  const payload = body.payload || {};
  const errors = validateSeasonWizardPayload(payload);
  const preview = buildSeasonWizardPreview(payload);
  if (errors.length) return NextResponse.json({ success: false, errors, preview }, { status: 400, headers: noStore });
  const supabase = createServerClient();
  const insertSeason = {
    name: payload.name,
    slug: preview.slug,
    start_date: payload.startDate,
    end_date: payload.endDate,
    status: payload.scheduledActivationAt ? 'upcoming' : 'draft',
    registration_status: 'closed',
    registration_url: null,
    playhq_season_id: payload.playhqSeasonId || null,
    source_season_id: payload.sourceSeasonId || null,
    scheduled_activation_at: payload.scheduledActivationAt || null,
    created_by: user.email,
    updated_by: user.email,
  };
  const { data: existing } = await supabase.from('club_season_wizard_states').select('*, club_seasons(*)').eq('idempotency_key', idempotencyKey).maybeSingle();
  if (existing) return NextResponse.json({ success: true, idempotent: true, state: existing, preview: existing.preview }, { headers: noStore });

  const { data: season, error: seasonError } = await supabase.from('club_seasons').insert(insertSeason).select(CLUB_SEASON_COLUMNS).single();
  if (seasonError) return NextResponse.json({ success: false, error: seasonError.message }, { status: 400, headers: noStore });
  const { data: state, error: stateError } = await supabase.from('club_season_wizard_states').insert({
    idempotency_key: idempotencyKey,
    club_season_id: season.id,
    source_season_id: payload.sourceSeasonId || null,
    current_step: Number(body.currentStep || 2),
    completed_steps: body.completedSteps || [1,2],
    copy_sections: {},
    draft_payload: payload,
    stale_warnings: preview.warnings,
    preview,
    status: 'ready',
    created_by: user.email,
    updated_by: user.email,
  }).select('*').single();
  if (stateError) return NextResponse.json({ success: false, error: stateError.message }, { status: 500, headers: noStore });
  return NextResponse.json({ success: true, season, state, preview }, { headers: noStore });
}

export async function PATCH(request: Request) {
  const user = await requirePermission('season.setup');
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403, headers: noStore });
  const body = await request.json().catch(() => ({}));
  const stateId = String(body.stateId || '').trim();
  if (!stateId) return NextResponse.json({ success: false, error: 'stateId is required.' }, { status: 400, headers: noStore });
  const supabase = createServerClient();
  if (body.action === 'activate') {
    const { data: state, error: stateError } = await supabase.from('club_season_wizard_states').select('club_season_id').eq('id', stateId).maybeSingle();
    if (stateError || !state?.club_season_id) return NextResponse.json({ success: false, error: stateError?.message || 'Wizard state has no season to activate.' }, { status: 400, headers: noStore });
    const { error } = await supabase.rpc('activate_club_season', { p_club_season_id: state.club_season_id, p_actor: user.email });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: noStore });
    await supabase.from('club_season_wizard_states').update({ status: 'activated', updated_by: user.email }).eq('id', stateId);
    return NextResponse.json({ success: true }, { headers: noStore });
  }
  return NextResponse.json({ success: false, error: 'Unsupported wizard action.' }, { status: 400, headers: noStore });
}
