/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { calculatePlayerStatPoints, getEnabledScoringRules } from '@/lib/fantasy-game';

export const dynamic = 'force-dynamic';

async function calculateRound(roundId: string) {
  const supabase = createServerClient();
  const rules = await getEnabledScoringRules();
  const { data: round, error: roundError } = await supabase.from('fantasy_rounds').select('id, season_id').eq('id', roundId).maybeSingle();
  if (roundError) throw new Error(roundError.message);
  if (!round) throw new Error('Round not found.');
  const seasonId = round.season_id as string;
  const { data: stats, error: statsError } = await supabase
    .from('fantasy_match_stats')
    .select('round_id, player_id, match_date, opponent, runs, wickets, maidens, catches, runouts, stumpings, ducks, not_out, player_of_match, fantasy_rounds(round_number), fantasy_players(display_name), fantasy_import_batches!inner(status)')
    .eq('round_id', roundId)
    .eq('fantasy_import_batches.status', 'published');
  if (statsError) throw new Error(statsError.message);

  const pointsByPlayer = new Map<string, number>();
  for (const stat of stats ?? []) {
    if (!stat.player_id) continue;
    pointsByPlayer.set(stat.player_id, (pointsByPlayer.get(stat.player_id) ?? 0) + calculatePlayerStatPoints(stat, rules));
  }

  const { data: squads, error: squadError } = await supabase
    .from('fantasy_squads')
    .select('id, manager_id, round_id, season_id, fantasy_managers(display_name, team_name), fantasy_squad_players(player_id, position_type, is_captain, fantasy_players(display_name))')
    .eq('season_id', seasonId)
    .or(`round_id.eq.${roundId},round_id.is.null`)
    .in('status', ['submitted', 'locked']);
  if (squadError) throw new Error(squadError.message);

  const { data: transfers, error: transferError } = await supabase.from('fantasy_transfers').select('manager_id, penalty_points').eq('round_id', roundId);
  if (transferError) throw new Error(transferError.message);
  const penaltyByManager = new Map<string, number>();
  for (const transfer of transfers ?? []) penaltyByManager.set(transfer.manager_id, (penaltyByManager.get(transfer.manager_id) ?? 0) + Number(transfer.penalty_points ?? 0));

  const { data: chips, error: chipError } = await supabase.from('fantasy_chips').select('manager_id, chip_type').eq('round_id', roundId);
  if (chipError) throw new Error(chipError.message);
  const chipsByManager = new Map<string, Set<string>>();
  for (const chip of chips ?? []) {
    const set = chipsByManager.get(chip.manager_id) ?? new Set<string>();
    set.add(chip.chip_type);
    chipsByManager.set(chip.manager_id, set);
  }

  const result = (squads ?? []).map((squad: any) => {
    const chipsForManager = chipsByManager.get(squad.manager_id) ?? new Set<string>();
    let total = 0;
    for (const squadPlayer of squad.fantasy_squad_players ?? []) {
      const playerPoints = pointsByPlayer.get(squadPlayer.player_id) ?? 0;
      const includeBench = chipsForManager.has('bench_boost');
      if (squadPlayer.position_type !== 'starter' && !includeBench) continue;
      if (squadPlayer.is_captain) total += chipsForManager.has('triple_captain') ? playerPoints * 3 : playerPoints * 2;
      else total += playerPoints;
    }
    const transferPenalty = penaltyByManager.get(squad.manager_id) ?? 0;
    return {
      managerId: squad.manager_id,
      squadId: squad.id,
      displayName: squad.fantasy_managers?.display_name || 'Fantasy manager',
      teamName: squad.fantasy_managers?.team_name || 'Team',
      totalPoints: Number(total.toFixed(2)),
      transferPenalty,
      netPoints: Number((total - transferPenalty).toFixed(2)),
      chips: Array.from(chipsForManager),
    };
  }).sort((a, b) => b.netPoints - a.netPoints);
  return { seasonId, rows: result };
}

export async function GET(request: Request) {
  const user = await requirePermission('fantasy.home');
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403 });
  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);
  const roundId = searchParams.get('roundId');
  const { data: rounds, error } = await supabase.from('fantasy_rounds').select('id, round_number, name, season_id').order('round_number');
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  const preview = roundId ? (await calculateRound(roundId)).rows : [];
  return NextResponse.json({ success: true, rounds, preview, warning: 'Scores are calculated using the currently enabled fantasy scoring rules and published import batches only.' });
}

export async function POST(request: Request) {
  const user = await requirePermission('fantasy.home');
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const roundId = String(body.roundId || '');
  if (!roundId) return NextResponse.json({ success: false, error: 'Round is required.' }, { status: 400 });
  const preview = await calculateRound(roundId);
  const supabase = createServerClient();
  const rows = preview.rows.map((row) => ({ manager_id: row.managerId, season_id: preview.seasonId, round_id: roundId, squad_id: row.squadId, total_points: row.totalPoints, transfer_penalty: row.transferPenalty, net_points: row.netPoints, calculated_at: new Date().toISOString() }));
  if (rows.length > 0) {
    const { error } = await supabase.from('fantasy_manager_round_scores').upsert(rows, { onConflict: 'manager_id,season_id,round_id' });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, saved: rows.length, preview: preview.rows });
}
