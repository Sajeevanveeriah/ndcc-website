import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { ROLE_LIMITS, getFantasySettings } from '@/lib/fantasy-game';

export const dynamic = 'force-dynamic';

async function ensureAdmin() {
  return requireSession(['admin', 'president', 'secretary', 'committee']);
}

export async function GET() {
  const user = await ensureAdmin();
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403 });
  try {
    const settings = await getFantasySettings();
    return NextResponse.json({ success: true, settings });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not load settings.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await ensureAdmin();
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const settings = await getFantasySettings();
  const roleLimits = {
    WK: Number(body?.maxPlayersPerRole?.WK ?? ROLE_LIMITS.WK),
    BAT: Number(body?.maxPlayersPerRole?.BAT ?? ROLE_LIMITS.BAT),
    AR: Number(body?.maxPlayersPerRole?.AR ?? ROLE_LIMITS.AR),
    BOWL: Number(body?.maxPlayersPerRole?.BOWL ?? ROLE_LIMITS.BOWL),
  };
  const payload = {
    season_name: String(body.seasonName || '').trim() || 'NDCC Fantasy Cricket',
    squad_budget: Number(body.squadBudget),
    max_players_per_role: roleLimits,
    free_transfers_per_round: Number(body.freeTransfersPerRound),
    transfer_penalty_points: Number(body.transferPenaltyPoints),
    is_registration_open: body.isRegistrationOpen === true,
    is_team_selection_open: body.isTeamSelectionOpen === true,
  };
  if (!Number.isFinite(payload.squad_budget) || payload.squad_budget <= 0) return NextResponse.json({ success: false, error: 'Squad budget must be greater than zero.' }, { status: 400 });
  if (!Number.isInteger(payload.free_transfers_per_round) || payload.free_transfers_per_round < 0) return NextResponse.json({ success: false, error: 'Free transfers must be zero or more.' }, { status: 400 });
  if (!Number.isInteger(payload.transfer_penalty_points) || payload.transfer_penalty_points < 0) return NextResponse.json({ success: false, error: 'Transfer penalty must be zero or more.' }, { status: 400 });
  if (Object.values(roleLimits).some((value) => !Number.isInteger(value) || value < 0)) return NextResponse.json({ success: false, error: 'Role limits must be whole numbers.' }, { status: 400 });

  const supabase = createServerClient();
  const { data, error } = await supabase.from('fantasy_settings').update(payload).eq('id', settings.id).select().single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, settings: data });
}
