/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { resolveFantasyManagerAuth } from '@/lib/fantasy-manager-auth';
import { createServerClient } from '@/lib/supabase-server';
import { getActivePlayersWithLatestPrices, getCurrentRoundId, getFantasySettings, getRoundLockState, validateSquadSelection, type SquadSelection } from '@/lib/fantasy-game';
import { resolveRequestSeason, seasonAllowsTeamChanges } from '@/lib/fantasy-seasons';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  const season = await resolveRequestSeason(request);
  if (!season) return NextResponse.json({ success: false, error: 'No fantasy season is available.' }, { status: 404 });
  const supabase = createServerClient();
  const [settings, players, roundId] = await Promise.all([getFantasySettings(season.id), getActivePlayersWithLatestPrices(season.id), getCurrentRoundId(season.id)]);
  const [{ data: squad, error: squadError }, { data: transfers, error: transferError }, { data: chips, error: chipError }] = await Promise.all([
    supabase.from('fantasy_squads').select('id, budget_used, fantasy_squad_players(player_id, position_type, bench_order, is_captain, is_vice_captain, fantasy_players(display_name, role))').eq('manager_id', auth.manager.id).eq('season_id', season.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('fantasy_transfers').select('id, round_id, player_out_id, player_in_id, penalty_points, created_at').eq('manager_id', auth.manager.id).eq('season_id', season.id).order('created_at', { ascending: false }),
    supabase.from('fantasy_chips').select('id, round_id, chip_type, used_at').eq('manager_id', auth.manager.id).eq('season_id', season.id),
  ]);
  if (squadError || transferError || chipError) return NextResponse.json({ success: false, error: squadError?.message || transferError?.message || chipError?.message }, { status: 500 });
  return NextResponse.json({ success: true, season, settings, players, squad, transfers, chips, roundId });
}

export async function POST(request: Request) {
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  const body = await request.json().catch(() => ({}));
  const playerOutId = String(body.playerOutId || '');
  const playerInId = String(body.playerInId || '');
  if (!playerOutId || !playerInId || playerOutId === playerInId) return NextResponse.json({ success: false, error: 'Choose different player out and player in values.' }, { status: 400 });

  const season = await resolveRequestSeason(request, body);
  if (!season) return NextResponse.json({ success: false, error: 'No fantasy season is available.' }, { status: 404 });
  const [settings, players, roundLock] = await Promise.all([getFantasySettings(season.id), getActivePlayersWithLatestPrices(season.id), getRoundLockState(season.id)]);
  if (!seasonAllowsTeamChanges(season)) return NextResponse.json({ success: false, error: 'Transfers are not open for this season.' }, { status: 403 });
  if (!settings.is_team_selection_open) return NextResponse.json({ success: false, error: 'Transfers are currently closed.' }, { status: 403 });
  if (roundLock.locked) return NextResponse.json({ success: false, error: roundLock.reason || 'The current round is locked, so transfers cannot be made.' }, { status: 403 });
  const roundId = roundLock.roundId;
  const playerIds = new Set(players.map((player) => player.id));
  if (!playerIds.has(playerInId)) return NextResponse.json({ success: false, error: 'Player in must be an active fantasy player.' }, { status: 400 });

  const supabase = createServerClient();
  const { data: squad, error: squadError } = await supabase
    .from('fantasy_squads')
    .select('id, fantasy_squad_players(player_id, position_type, bench_order, is_captain, is_vice_captain)')
    .eq('manager_id', auth.manager.id)
    .eq('season_id', season.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (squadError) return NextResponse.json({ success: false, error: squadError.message }, { status: 500 });
  if (!squad) return NextResponse.json({ success: false, error: 'Create a valid squad before making transfers.' }, { status: 400 });

  const current = ((squad as any).fantasy_squad_players ?? []) as any[];
  const outgoing = current.find((item) => item.player_id === playerOutId);
  if (!outgoing) return NextResponse.json({ success: false, error: 'Player out is not in your current squad.' }, { status: 400 });
  if (current.some((item) => item.player_id === playerInId)) return NextResponse.json({ success: false, error: 'Player in is already in your squad.' }, { status: 400 });

  const nextSelection: SquadSelection[] = current.map((item) => ({
    playerId: item.player_id === playerOutId ? playerInId : item.player_id,
    positionType: item.position_type === 'bench' ? 'bench' : 'starter',
    benchOrder: item.bench_order,
    isCaptain: item.is_captain === true,
    isViceCaptain: item.is_vice_captain === true,
  }));
  const validation = validateSquadSelection(nextSelection, players, settings);
  if (!validation.valid) return NextResponse.json({ success: false, error: validation.errors.join(' ') }, { status: 400 });

  const [{ count, error: countError }, { data: chips, error: chipError }] = await Promise.all([
    supabase.from('fantasy_transfers').select('id', { count: 'exact', head: true }).eq('manager_id', auth.manager.id).eq('season_id', season.id).eq('round_id', roundId),
    supabase.from('fantasy_chips').select('chip_type, round_id').eq('manager_id', auth.manager.id).eq('season_id', season.id),
  ]);
  if (countError || chipError) return NextResponse.json({ success: false, error: countError?.message || chipError?.message }, { status: 500 });
  const wildcardActive = (chips ?? []).some((chip: any) => chip.chip_type === 'wildcard' && chip.round_id === roundId);
  const transferNumber = (count ?? 0) + 1;
  const penalty = wildcardActive || transferNumber <= settings.free_transfers_per_round ? 0 : settings.transfer_penalty_points;

  const update = await supabase.from('fantasy_squad_players').update({ player_id: playerInId }).eq('squad_id', squad.id).eq('player_id', playerOutId);
  if (update.error) return NextResponse.json({ success: false, error: update.error.message }, { status: 500 });
  await supabase.from('fantasy_squads').update({ budget_used: validation.budgetUsed }).eq('id', squad.id);
  const audit = await supabase.from('fantasy_transfers').insert({ manager_id: auth.manager.id, season_id: season.id, round_id: roundId, player_out_id: playerOutId, player_in_id: playerInId, penalty_points: penalty }).select().single();
  if (audit.error) return NextResponse.json({ success: false, error: audit.error.message }, { status: 500 });
  return NextResponse.json({ success: true, transfer: audit.data, penaltyPoints: penalty });
}
