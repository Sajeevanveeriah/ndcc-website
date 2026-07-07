/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { resolveFantasyManagerAuth } from '@/lib/fantasy-manager-auth';
import { createServerClient } from '@/lib/supabase-server';
import { getActivePlayersWithLatestPrices, getFantasySettings, getRoundLockState, validateDraftSquadSelection, validateSquadSelection, type SquadSelection } from '@/lib/fantasy-game';

export const dynamic = 'force-dynamic';

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
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  try {
    const [settings, players, squad] = await Promise.all([getFantasySettings(), getActivePlayersWithLatestPrices(), loadSquad(auth.manager.id)]);
    return NextResponse.json({ success: true, settings, players, squad });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not load squad.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });

  const body = await request.json().catch(() => ({}));
  const selection = parseSelection(body.selection);
  // mode 'draft' saves work-in-progress squads with relaxed validation;
  // anything else keeps the original submit behaviour for existing clients.
  const isDraft = body.mode === 'draft';
  const [settings, players, roundLock] = await Promise.all([getFantasySettings(), getActivePlayersWithLatestPrices(), getRoundLockState()]);
  if (!settings.is_team_selection_open) return NextResponse.json({ success: false, error: 'Team selection is currently closed.' }, { status: 403 });
  if (roundLock.locked) return NextResponse.json({ success: false, error: roundLock.reason || 'The current round is locked, so squads cannot be changed.' }, { status: 403 });
  const roundId = roundLock.roundId;

  const validation = isDraft
    ? validateDraftSquadSelection(selection, players, settings)
    : validateSquadSelection(selection, players, settings);
  if (!validation.valid) return NextResponse.json({ success: false, error: validation.errors.join(' ') }, { status: 400 });

  const supabase = createServerClient();
  const squadValues = { manager_id: auth.manager.id, round_id: roundId, status: isDraft ? 'draft' : 'submitted', budget_used: validation.budgetUsed };
  const squadColumns = 'id, manager_id, round_id, status, budget_used';
  let squadResult;
  if (roundId) {
    squadResult = await supabase
      .from('fantasy_squads')
      .upsert(squadValues, { onConflict: 'manager_id,round_id' })
      .select(squadColumns)
      .single();
  } else {
    // UNIQUE(manager_id, round_id) does not constrain NULL round_id rows, so the
    // upsert above would insert a fresh squad on every save. Update the existing
    // pre-season squad when one exists instead.
    const existing = await supabase
      .from('fantasy_squads')
      .select('id')
      .eq('manager_id', auth.manager.id)
      .is('round_id', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing.error) return NextResponse.json({ success: false, error: existing.error.message }, { status: 500 });
    squadResult = existing.data
      ? await supabase.from('fantasy_squads').update(squadValues).eq('id', existing.data.id).select(squadColumns).single()
      : await supabase.from('fantasy_squads').insert(squadValues).select(squadColumns).single();
  }
  const { data: squad, error: squadError } = squadResult;
  if (squadError || !squad) return NextResponse.json({ success: false, error: squadError?.message || 'Could not save squad.' }, { status: 500 });

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
