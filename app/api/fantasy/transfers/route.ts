import { NextResponse } from 'next/server';
import { resolveFantasyManagerAuth } from '@/lib/fantasy-manager-auth';
import { createServerClient } from '@/lib/supabase-server';
import { getActivePlayersWithLatestPrices, getCurrentRoundId } from '@/lib/fantasy-game';
import { getDinoCoachSettings, toPublicDinoCoachSettings } from '@/lib/dino-coach/server';
import { isTransferWindowOpen } from '@/lib/dino-coach/domain';
import { resolveRequestSeason, seasonAllowsTeamChanges } from '@/lib/fantasy-seasons';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  const season = await resolveRequestSeason(request);
  if (!season) return NextResponse.json({ success: false, error: 'No Dino Coach season is available.' }, { status: 404 });
  const supabase = createServerClient();
  const [settings, players, roundId, squad, transfers] = await Promise.all([
    getDinoCoachSettings(season.id), getActivePlayersWithLatestPrices(season.id), getCurrentRoundId(season.id),
    supabase.from('fantasy_squads').select('id,budget_used_dino_dollars,fantasy_squad_players(player_id,slot_key,assigned_role,position_type,purchase_price_dino_dollars,fantasy_players(display_name))').eq('manager_id', auth.manager.id).eq('season_id', season.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('fantasy_transfers').select('id,round_id,player_out_id,player_in_id,penalty_points,created_at').eq('manager_id', auth.manager.id).eq('season_id', season.id).order('created_at', { ascending: false }),
  ]);
  if (squad.error || transfers.error) return NextResponse.json({ success: false, error: squad.error?.message || transfers.error?.message }, { status: 500 });
  const windowOpen = settings.public_launch_enabled && settings.team_selection_open && isTransferWindowOpen(new Date(), {
    timezone: settings.transfer_timezone, openWeekday: settings.transfer_open_weekday, openMinute: settings.transfer_open_minute,
    closeWeekday: settings.transfer_close_weekday, closeMinute: settings.transfer_close_minute,
  });
  return NextResponse.json({ success: true, season, settings: toPublicDinoCoachSettings(settings), players, squad: squad.data, transfers: transfers.data, roundId, windowOpen, chips: [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  const body = await request.json().catch(() => ({}));
  const playerOutId = String(body.playerOutId || ''); const playerInId = String(body.playerInId || '');
  if (!playerOutId || !playerInId || playerOutId === playerInId) return NextResponse.json({ success: false, error: 'Choose different outgoing and incoming players.' }, { status: 400 });
  const season = await resolveRequestSeason(request, body);
  if (!season || !seasonAllowsTeamChanges(season)) return NextResponse.json({ success: false, error: 'Transfers are not open for this season.' }, { status: 403 });
  const roundId = await getCurrentRoundId(season.id);
  const { data, error } = await createServerClient().rpc('make_dino_coach_transfer', { target_manager_id: auth.manager.id, target_season_id: season.id, target_round_id: roundId, player_out: playerOutId, player_in: playerInId });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: /window|closed/i.test(error.message) ? 403 : 400 });
  return NextResponse.json({ success: true, transfer: { id: data }, penaltyPoints: 0 });
}
