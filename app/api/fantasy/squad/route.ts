/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { resolveFantasyManagerAuth } from '@/lib/fantasy-manager-auth';
import { createServerClient } from '@/lib/supabase-server';
import { resolveRequestSeason, seasonAllowsTeamChanges } from '@/lib/fantasy-seasons';
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

async function loadSquad(managerId: string, seasonId: string) {
  const supabase = createServerClient();
  const { data: squad, error } = await supabase
    .from('fantasy_squads')
    .select('id, manager_id, season_id, round_id, status, budget_used, carried_from_squad_id, fantasy_squad_players(player_id, position_type, bench_order, is_captain, is_vice_captain, fantasy_players(display_name, role))')
    .eq('manager_id', managerId)
    .eq('season_id', seasonId)
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
    const season = await resolveRequestSeason(request);
    if (!season) return NextResponse.json({ success: false, error: 'No fantasy season is available.' }, { status: 404 });
    const [settings, players, squad] = await Promise.all([
      getFantasySettings(season.id),
      getActivePlayersWithLatestPrices(season.id),
      loadSquad(auth.manager.id, season.id),
    ]);
    return NextResponse.json({ success: true, season, settings, players, squad });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not load squad.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });

  const body = await request.json().catch(() => ({}));
  const season = await resolveRequestSeason(request, body);
  if (!season) return NextResponse.json({ success: false, error: 'No fantasy season is available.' }, { status: 404 });
  const selection = parseSelection(body.selection);
  // mode 'draft' saves work-in-progress squads with relaxed validation;
  // anything else keeps the original submit behaviour for existing clients.
  const isDraft = body.mode === 'draft';
  const [settings, players, roundLock] = await Promise.all([
    getFantasySettings(season.id),
    getActivePlayersWithLatestPrices(season.id),
    getRoundLockState(season.id),
  ]);
  if (!seasonAllowsTeamChanges(season)) return NextResponse.json({ success: false, error: 'Team building is not open for this season.' }, { status: 403 });
  if (!settings.is_team_selection_open) return NextResponse.json({ success: false, error: 'Team selection is currently closed.' }, { status: 403 });
  if (season.is_current && roundLock.locked) return NextResponse.json({ success: false, error: roundLock.reason || 'The current round is locked, so squads cannot be changed.' }, { status: 403 });
  const roundId = season.is_current ? roundLock.roundId : null;

  const validation = isDraft
    ? validateDraftSquadSelection(selection, players, settings)
    : validateSquadSelection(selection, players, settings);
  if (!validation.valid) return NextResponse.json({ success: false, error: validation.errors.join(' ') }, { status: 400 });

  const supabase = createServerClient();
  const squadValues = { manager_id: auth.manager.id, season_id: season.id, round_id: roundId, status: isDraft ? 'draft' : 'submitted', budget_used: validation.budgetUsed };
  const squadColumns = 'id, manager_id, season_id, round_id, status, budget_used';
  let squadResult;
  if (roundId) {
    squadResult = await supabase
      .from('fantasy_squads')
      .upsert(squadValues, { onConflict: 'manager_id,season_id,round_id' })
      .select(squadColumns)
      .single();
  } else {
    // Unique NULL-round squads are enforced per (manager, season) by a partial
    // index; update the existing pre-season squad when one exists.
    const existing = await supabase
      .from('fantasy_squads')
      .select('id')
      .eq('manager_id', auth.manager.id)
      .eq('season_id', season.id)
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
