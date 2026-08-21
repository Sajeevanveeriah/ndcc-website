/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { calculateAssignedRolePoints } from '@/lib/dino-coach/domain';
import { getDinoCoachSettings } from '@/lib/dino-coach/server';

export const dynamic = 'force-dynamic';

async function calculateRound(roundId: string) {
  const supabase = createServerClient();
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

  const statsByPlayer = new Map<string, any[]>();
  for (const stat of stats ?? []) {
    if (!stat.player_id) continue;
    const items=statsByPlayer.get(stat.player_id)??[];items.push(stat);statsByPlayer.set(stat.player_id,items);
  }
  const dinoSettings=await getDinoCoachSettings(seasonId);

  const { data: squads, error: squadError } = await supabase
    .from('fantasy_squads')
    .select('id, manager_id, round_id, season_id, fantasy_managers(display_name, team_name), fantasy_squad_players(player_id, position_type, assigned_role, is_captain, is_vice_captain, fantasy_players(display_name))')
    .eq('season_id', seasonId)
    .or(`round_id.eq.${roundId},round_id.is.null`)
    .in('status', ['submitted', 'locked']);
  if (squadError) throw new Error(squadError.message);

  const result = (squads ?? []).map((squad: any) => {
    let total = 0;
    for (const squadPlayer of squad.fantasy_squad_players ?? []) {
      if (squadPlayer.position_type !== 'starter') continue;
      const leadershipMultiplier=squadPlayer.is_captain?dinoSettings.scoring_config.captainMultiplier:squadPlayer.is_vice_captain?dinoSettings.scoring_config.viceCaptainMultiplier:undefined;
      for(const stat of statsByPlayer.get(squadPlayer.player_id)??[]) total+=calculateAssignedRolePoints(stat,squadPlayer.assigned_role,dinoSettings.scoring_config,leadershipMultiplier!==undefined,leadershipMultiplier);
    }
    const transferPenalty = 0;
    return {
      managerId: squad.manager_id,
      squadId: squad.id,
      displayName: squad.fantasy_managers?.display_name || 'Fantasy manager',
      teamName: squad.fantasy_managers?.team_name || 'Team',
      totalPoints: Number(total.toFixed(2)),
      transferPenalty,
      netPoints: Number((total - transferPenalty).toFixed(2)),
      chips: [],
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
