import { NextResponse } from 'next/server';
import { resolveFantasyManagerAuth } from '@/lib/fantasy-manager-auth';
import { CHIP_TYPES, getFantasySettings, getRoundLockState, type ChipType } from '@/lib/fantasy-game';
import { createServerClient } from '@/lib/supabase-server';
import { resolveRequestSeason, seasonAllowsTeamChanges } from '@/lib/fantasy-seasons';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  const body = await request.json().catch(() => ({}));
  const chipType = String(body.chipType || '') as ChipType;
  if (!CHIP_TYPES.includes(chipType)) return NextResponse.json({ success: false, error: 'Unknown chip type.' }, { status: 400 });
  const season = await resolveRequestSeason(request, body);
  if (!season) return NextResponse.json({ success: false, error: 'No fantasy season is available.' }, { status: 404 });
  const [settings, roundLock] = await Promise.all([getFantasySettings(season.id), getRoundLockState(season.id)]);
  if (!seasonAllowsTeamChanges(season)) return NextResponse.json({ success: false, error: 'Chips are not open for this season.' }, { status: 403 });
  if (!settings.is_team_selection_open) return NextResponse.json({ success: false, error: 'Team selection is currently closed, so chips cannot be used.' }, { status: 403 });
  if (roundLock.locked) return NextResponse.json({ success: false, error: roundLock.reason || 'The current round is locked, so chips cannot be used.' }, { status: 403 });
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('fantasy_chips')
    .insert({ manager_id: auth.manager.id, season_id: season.id, round_id: roundLock.roundId, chip_type: chipType })
    .select('id, round_id, chip_type, used_at')
    .single();
  if (error) return NextResponse.json({ success: false, error: error.code === '23505' ? 'That chip has already been used this season.' : error.message }, { status: 400 });
  return NextResponse.json({ success: true, chip: data });
}
