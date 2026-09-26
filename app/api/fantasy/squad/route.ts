import { readFantasyMutation } from '@/lib/server/fantasy-mutation';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { managerEligibilityIssues } from '@/lib/dino-coach/manager-eligibility';
import { getPlayerStats } from '@/lib/dino-coach/player-stats-server';
import { NextResponse } from 'next/server';
import { resolveFantasyManagerAuth } from '@/lib/fantasy-manager-auth';
import { createServerClient } from '@/lib/supabase-server';
import { resolveRequestSeason, seasonAllowsTeamChanges } from '@/lib/fantasy-seasons';
import { getActivePlayersWithLatestPrices, getRoundLockState } from '@/lib/fantasy-game';
import { buildSquadSlots, validateSquadAssignments, type DinoSquadAssignment } from '@/lib/dino-coach/domain';
import { getDinoCoachSettings, toPublicDinoCoachSettings } from '@/lib/dino-coach/server';
import { logRouteError, publicRpcErrorMessage } from '@/lib/server/public-errors';

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
    .select('id,manager_id,season_id,round_id,status,updated_at,budget_used_dino_dollars,fantasy_squad_players(player_id,position_type,is_captain,is_vice_captain,slot_key,assigned_role,purchase_price_dino_dollars,fantasy_players(display_name))')
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
    const entry = await createServerClient().from('fantasy_entries').select('status,is_demo,fee_waived').eq('manager_id', auth.manager.id).eq('season_id', season.id).maybeSingle();
    if (entry.error) {
      logRouteError('fantasy/squad:entry', entry.error);
      return NextResponse.json({ success: false, error: 'Could not check your entry status. Please try again.' }, { status: 503 });
    }
    const eligibilityIssues = managerEligibilityIssues(auth.manager, entry.data, settings.rules_version);
    const stats = await getPlayerStats(season.id, players);
    return NextResponse.json({ success: true, eligibilityIssues, managerId: auth.manager.id, season, settings: toPublicDinoCoachSettings(settings), slots: buildSquadSlots(settings.slot_counts), players: players.map(p => ({ ...p, stats: stats.get(p.id) ?? null })), squad }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logRouteError('fantasy/squad:get', error);
    return NextResponse.json({ success: false, error: 'Could not load Dino Coach squad.' }, { status: 500 });
  }
}

// Settings, player, round and database read failures return friendly JSON.
export async function POST(request: Request) {
  try {
    return await saveSquad(request);
  } catch (error) {
    logRouteError('fantasy/squad:post', error);
    return NextResponse.json({ success: false, error: 'Could not save your Dino Coach squad. Please reload and try again.' }, { status: 500 });
  }
}

async function saveSquad(request: Request) {
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  const input = await readFantasyMutation(request, auth.manager.id, 'squad');
  if ('response' in input) return input.response;
  const body = input.body;
  if (!Array.isArray(body.selection) || body.selection.length > 100 || body.selection.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    return NextResponse.json({ success: false, error: 'Send a valid squad selection.' }, { status: 400 });
  }
  const season = await resolveRequestSeason(request, body);
  if (!season) return NextResponse.json({ success: false, error: 'No Dino Coach season is available.' }, { status: 404 });
  if (!seasonAllowsTeamChanges(season)) return NextResponse.json({ success: false, error: 'Team building is not open for this season.' }, { status: 403 });
  const selection = parseSelection(body.selection);
  const isDraft = body.mode === 'draft';
  const [settings, players, roundLock] = await Promise.all([getDinoCoachSettings(season.id), getActivePlayersWithLatestPrices(season.id), getRoundLockState(season.id)]);
  const entry = await createServerClient().from('fantasy_entries').select('status,is_demo,fee_waived').eq('manager_id', auth.manager.id).eq('season_id', season.id).maybeSingle();
  if (entry.error) return NextResponse.json({ success: false, error: 'Could not check your entry status. Please try again.' }, { status: 503 });
  const issues = managerEligibilityIssues(auth.manager, entry.data, settings.rules_version);
  if (issues.length) return NextResponse.json({ success: false, error: issues.map(issue => issue.message).join(' '), eligibilityIssues: issues }, { status: 403 });
  if (!settings.public_launch_enabled || !settings.team_selection_open) return NextResponse.json({ success: false, error: 'Dino Coach team selection is currently closed.' }, { status: 403 });
  if (season.is_current && roundLock.locked) return NextResponse.json({ success: false, error: roundLock.reason || 'The current round is locked.' }, { status: 403 });

  const priceByPlayer = new Map(players.map((player) => [player.id, player.price_dino_dollars]));
  if (selection.some((item) => !priceByPlayer.has(item.playerId))) return NextResponse.json({ success: false, error: 'Replace players who are no longer eligible for this season before saving.' }, { status: 400 });
  const previous = await loadSquad(auth.manager.id, season.id);
  const ownedCosts = new Map((previous?.fantasy_squad_players || []).map((item) => [item.player_id, Number(item.purchase_price_dino_dollars)]));
  const authoritativeSelection = selection.map((item) => ({ ...item, purchasePriceDinoDollars: ownedCosts.get(item.playerId) ?? priceByPlayer.get(item.playerId) ?? 0 }));
  if (selection.some((item, index) => item.purchasePriceDinoDollars !== authoritativeSelection[index].purchasePriceDinoDollars)) return NextResponse.json({ success: false, error: 'Player prices changed. Reload before saving.' }, { status: 409 });
  const validation = validateSquadAssignments(authoritativeSelection, buildSquadSlots(settings.slot_counts), settings.budget_dino_dollars, { allowIncomplete: isDraft });
  if (!validation.valid) return NextResponse.json({ success: false, error: validation.errors.join(' ') }, { status: 400 });
  const { data, error } = await createServerClient().rpc('save_dino_coach_squad_v2', {
    target_manager_id: auth.manager.id, target_season_id: season.id, target_round_id: season.is_current ? roundLock.roundId : null,
    target_status: isDraft ? 'draft' : 'submitted', expected_budget: validation.budgetUsedDinoDollars, expected_updated_at: typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : null,
    selected_players: authoritativeSelection.map((item) => ({ player_id: item.playerId, slot_key: item.slotKey, assigned_role: item.assignedRole, position_type: item.positionType, is_captain: item.isCaptain, is_vice_captain: item.isViceCaptain })),
  });
  if (error) {
    logRouteError('fantasy/squad:save', error);
    return NextResponse.json({ success: false, error: publicRpcErrorMessage(error, 'Could not save your Dino Coach squad. Please reload and try again.') }, { status: /closed|eligibility|paid/i.test(error.message) ? 403 : 400 });
  }
  return NextResponse.json({ success: true, squad: { id: data, status: isDraft ? 'draft' : 'submitted' }, selection: authoritativeSelection.map((item) => ({ ...item, displayName: players.find((player) => player.id === item.playerId)?.display_name })) });
}
