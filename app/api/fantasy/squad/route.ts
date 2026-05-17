/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { requireFantasyManager } from '@/lib/fantasy-manager-auth';
import { createServerClient } from '@/lib/supabase-server';
import { getActivePlayersWithLatestPrices, getCurrentRoundId, getFantasySettings, validateSquadSelection, type SquadSelection } from '@/lib/fantasy-game';

function parseSelection(value: unknown): SquadSelection[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => ({
    playerId: String(item.playerId || ''),
    positionType: item.positionType === 'bench' ? 'bench' : 'starter',
    benchOrder: item.benchOrder === null || item.benchOrder === undefined || item.benchOrder === '' ? null : Number(item.benchOrder),
    isCaptain: item.isCaptain === true,
    isViceCaptain: item.isViceCaptain === true,
  }));
}

async function loadSquad(managerId: string) {
  const supabase = createServerClient();
  const { data: squad, error } = await supabase
    .from('fantasy_squads')
    .select('id, manager_id, round_id, status, budget_used, fantasy_squad_players(player_id, position_type, bench_order, is_captain, is_vice_captain, fantasy_players(display_name, role))')
    .eq('manager_id', managerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return squad;
}

export async function GET(request: Request) {
  const auth = await requireFantasyManager(request);
  if (!auth) return NextResponse.json({ success: false, error: 'Fantasy manager sign in is required.' }, { status: 401 });
  try {
    const [settings, players, squad] = await Promise.all([getFantasySettings(), getActivePlayersWithLatestPrices(), loadSquad(auth.manager.id)]);
    return NextResponse.json({ success: true, settings, players, squad });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not load squad.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireFantasyManager(request);
  if (!auth) return NextResponse.json({ success: false, error: 'Fantasy manager sign in is required.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const selection = parseSelection(body.selection);
  const [settings, players, roundId] = await Promise.all([getFantasySettings(), getActivePlayersWithLatestPrices(), getCurrentRoundId()]);
  if (!settings.is_team_selection_open) return NextResponse.json({ success: false, error: 'Team selection is currently closed.' }, { status: 403 });

  const validation = validateSquadSelection(selection, players, settings);
  if (!validation.valid) return NextResponse.json({ success: false, error: validation.errors.join(' ') }, { status: 400 });

  const supabase = createServerClient();
  const { data: squad, error: squadError } = await supabase
    .from('fantasy_squads')
    .upsert({ manager_id: auth.manager.id, round_id: roundId, status: 'submitted', budget_used: validation.budgetUsed }, { onConflict: 'manager_id,round_id' })
    .select('id, manager_id, round_id, status, budget_used')
    .single();
  if (squadError) return NextResponse.json({ success: false, error: squadError.message }, { status: 500 });

  const deleteResult = await supabase.from('fantasy_squad_players').delete().eq('squad_id', squad.id);
  if (deleteResult.error) return NextResponse.json({ success: false, error: deleteResult.error.message }, { status: 500 });

  const rows = selection.map((item) => ({
    squad_id: squad.id,
    player_id: item.playerId,
    position_type: item.positionType,
    bench_order: item.positionType === 'bench' ? item.benchOrder : null,
    is_captain: item.isCaptain,
    is_vice_captain: item.isViceCaptain,
  }));
  const insertResult = await supabase.from('fantasy_squad_players').insert(rows);
  if (insertResult.error) return NextResponse.json({ success: false, error: insertResult.error.message }, { status: 500 });

  return NextResponse.json({ success: true, squad });
}
