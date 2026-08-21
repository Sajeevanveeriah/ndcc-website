/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { resolveFantasyManagerAuth } from '@/lib/fantasy-manager-auth';
import { createServerClient } from '@/lib/supabase-server';
import { resolveRequestSeason, seasonAllowsTeamChanges } from '@/lib/fantasy-seasons';
import { getActivePlayersWithLatestPrices, getRoundLockState } from '@/lib/fantasy-game';
import { buildSquadSlots, validateSquadAssignments, type DinoSquadAssignment } from '@/lib/dino-coach/domain';
import { getDinoCoachSettings, toPublicDinoCoachSettings } from '@/lib/dino-coach/server';

export const dynamic = 'force-dynamic';

function parseSelection(value: unknown): DinoSquadAssignment[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => ({
    slotKey: String(item.slotKey || ''), playerId: String(item.playerId || ''), assignedRole: item.assignedRole,
    positionType: item.positionType === 'bench' ? 'bench' : 'starter', isCaptain: item.isCaptain === true,
    isViceCaptain: item.isViceCaptain === true, purchasePriceDinoDollars: Number(item.purchasePriceDinoDollars ?? 0),
  }));
}

async function loadSquad(managerId: string, seasonId: string) {
  const { data, error } = await createServerClient().from('fantasy_squads')
    .select('id,manager_id,season_id,round_id,status,budget_used_dino_dollars,fantasy_squad_players(player_id,position_type,is_captain,is_vice_captain,slot_key,assigned_role,purchase_price_dino_dollars,fantasy_players(display_name))')
    .eq('manager_id', managerId).eq('season_id', seasonId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function GET(request: Request) {
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  try {
    const season = await resolveRequestSeason(request);
    if (!season) return NextResponse.json({ success: false, error: 'No Dino Coach season is available.' }, { status: 404 });
    const [settings, players, squad] = await Promise.all([getDinoCoachSettings(season.id), getActivePlayersWithLatestPrices(season.id), loadSquad(auth.manager.id, season.id)]);
    return NextResponse.json({ success: true, season, settings: toPublicDinoCoachSettings(settings), slots: buildSquadSlots(settings.slot_counts), players, squad }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Could not load Dino Coach squad.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  const body = await request.json().catch(() => ({}));
  const season = await resolveRequestSeason(request, body);
  if (!season) return NextResponse.json({ success: false, error: 'No Dino Coach season is available.' }, { status: 404 });
  if (!seasonAllowsTeamChanges(season)) return NextResponse.json({ success: false, error: 'Team building is not open for this season.' }, { status: 403 });
  const selection = parseSelection(body.selection);
  const isDraft = body.mode === 'draft';
  const [settings, players, roundLock] = await Promise.all([getDinoCoachSettings(season.id), getActivePlayersWithLatestPrices(season.id), getRoundLockState(season.id)]);
  if (!settings.public_launch_enabled || !settings.team_selection_open) return NextResponse.json({ success: false, error: 'Dino Coach team selection is currently closed.' }, { status: 403 });
  if (season.is_current && roundLock.locked) return NextResponse.json({ success: false, error: roundLock.reason || 'The current round is locked.' }, { status: 403 });

  const priceByPlayer = new Map(players.map((player) => [player.id, player.price_dino_dollars]));
  const authoritativeSelection = selection.map((item) => ({ ...item, purchasePriceDinoDollars: priceByPlayer.get(item.playerId) ?? 0 }));
  const validation = validateSquadAssignments(authoritativeSelection, buildSquadSlots(settings.slot_counts), settings.budget_dino_dollars, { allowIncomplete: isDraft });
  if (!validation.valid) return NextResponse.json({ success: false, error: validation.errors.join(' ') }, { status: 400 });
  const { data, error } = await createServerClient().rpc('save_dino_coach_squad', {
    target_manager_id: auth.manager.id, target_season_id: season.id, target_round_id: season.is_current ? roundLock.roundId : null,
    target_status: isDraft ? 'draft' : 'submitted', target_budget_dino_dollars: validation.budgetUsedDinoDollars,
    selected_players: authoritativeSelection.map((item) => ({ player_id: item.playerId, slot_key: item.slotKey, assigned_role: item.assignedRole, position_type: item.positionType, is_captain: item.isCaptain, is_vice_captain: item.isViceCaptain })),
  });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: /closed|eligibility|paid/i.test(error.message) ? 403 : 400 });
  return NextResponse.json({ success: true, squad: { id: data, status: isDraft ? 'draft' : 'submitted' } });
}
