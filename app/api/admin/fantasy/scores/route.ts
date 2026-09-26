/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { calculateAssignedRolePoints } from '@/lib/dino-coach/domain';
import { getDinoCoachSettings } from '@/lib/dino-coach/server';
import { SCORING_SQUAD_STATUSES, selectScoringSquads } from '@/lib/dino-coach/round-scoring';
import { fetchAllPages } from '@/lib/fantasy-paging';
import { resolveSeason } from '@/lib/fantasy-seasons';

export const dynamic = 'force-dynamic';

class ScoringInputError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const SQUAD_DETAIL_CHUNK = 200;

function seasonSelector(request: Request, body?: { season?: unknown; seasonId?: unknown }) {
  const url = new URL(request.url);
  const fromBody = [body?.seasonId, body?.season].find((value) => typeof value === 'string' && value.trim());
  return (fromBody as string | undefined) || url.searchParams.get('seasonId') || url.searchParams.get('season');
}

function scoringErrorResponse(error: unknown, fallback: string) {
  if (error instanceof ScoringInputError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  console.error('[admin-fantasy-scores]', error instanceof Error ? error.message : error);
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}

async function calculateRound(roundId: string, expectedSeasonId: string | null) {
  const supabase = createServerClient();
  const { data: round, error: roundError } = await supabase.from('fantasy_rounds').select('id, season_id, round_number').eq('id', roundId).maybeSingle();
  if (roundError) throw new Error(roundError.message);
  if (!round) throw new ScoringInputError('Round not found.', 404);
  if (expectedSeasonId && round.season_id !== expectedSeasonId) throw new ScoringInputError('That round is not part of the selected season.');
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

  const { data: seasonRounds, error: seasonRoundsError } = await supabase.from('fantasy_rounds').select('id, round_number').eq('season_id', seasonId);
  if (seasonRoundsError) throw new Error(seasonRoundsError.message);
  const roundNumbers = new Map<string, number | null>((seasonRounds ?? []).map((item: any) => [item.id, item.round_number === null || item.round_number === undefined ? null : Number(item.round_number)]));

  // Light candidate list first (every submitted/locked squad of active
  // managers this season), then full details only for the chosen squads.
  const candidates = await fetchAllPages<any>((from, to) => supabase
    .from('fantasy_squads')
    .select('id, manager_id, round_id, status, created_at, fantasy_managers!inner(is_active, deleted_at)')
    .eq('season_id', seasonId)
    .in('status', [...SCORING_SQUAD_STATUSES])
    .eq('fantasy_managers.is_active',true).is('fantasy_managers.deleted_at',null)
    .order('id', { ascending: true })
    .range(from, to));
  const chosenIds = selectScoringSquads(candidates, {
    roundId,
    roundNumber: round.round_number === null || round.round_number === undefined ? null : Number(round.round_number),
    roundNumbers,
  }).map((squad) => squad.id);

  const squads: any[] = [];
  for (let index = 0; index < chosenIds.length; index += SQUAD_DETAIL_CHUNK) {
    const { data, error: squadError } = await supabase
      .from('fantasy_squads')
      .select('id, manager_id, round_id, season_id, fantasy_managers!inner(display_name, team_name, is_active, deleted_at), fantasy_squad_players(player_id, position_type, assigned_role, is_captain, is_vice_captain, fantasy_players(display_name))')
      .in('id', chosenIds.slice(index, index + SQUAD_DETAIL_CHUNK));
    if (squadError) throw new Error(squadError.message);
    squads.push(...(data ?? []));
  }

  const result = squads.map((squad: any) => {
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
      carriedForward: squad.round_id !== roundId,
    };
  }).sort((a, b) => b.netPoints - a.netPoints);
  return { seasonId, rows: result };
}

function isMissingFunction(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function|function .* does not exist/i.test(error.message || '')));
}

// Replace the round's saved scores: upsert recalculated rows and remove rows for
// managers no longer scored, atomically via replace_dino_coach_round_scores.
async function replaceRoundScores(seasonId: string, roundId: string, rows: Array<Record<string, unknown>>) {
  const supabase = createServerClient();
  const replaced = await supabase.rpc('replace_dino_coach_round_scores', { target_season_id: seasonId, target_round_id: roundId, score_rows: rows });
  if (!replaced.error) return;
  if (!isMissingFunction(replaced.error)) throw new Error(replaced.error.message);
  // Migration not applied yet: previous upsert, then remove stale rows.
  if (rows.length > 0) {
    const { error } = await supabase.from('fantasy_manager_round_scores').upsert(rows, { onConflict: 'manager_id,season_id,round_id' });
    if (error) throw new Error(error.message);
  }
  let stale = supabase.from('fantasy_manager_round_scores').delete().eq('season_id', seasonId).eq('round_id', roundId);
  if (rows.length > 0) stale = stale.not('manager_id', 'in', `(${rows.map((row) => String(row.manager_id)).join(',')})`);
  const { error: staleError } = await stale;
  if (staleError) throw new Error(staleError.message);
}

export async function GET(request: Request) {
  const user = await requirePermission('fantasy.home');
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403 });
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const roundId = searchParams.get('roundId');
    const season = await resolveSeason(seasonSelector(request), { includeNonPublic: true });
    if (!season) return NextResponse.json({ success: true, season: null, rounds: [], preview: [], warning: 'No Dino Coach season is configured.' });
    const { data: rounds, error } = await supabase.from('fantasy_rounds').select('id, round_number, name, season_id').eq('season_id', season.id).order('round_number');
    if (error) throw new Error(error.message);
    const preview = roundId ? (await calculateRound(roundId, season.id)).rows : [];
    return NextResponse.json({ success: true, season: { id: season.id, name: season.name }, rounds, preview, warning: 'Scores are calculated using the currently enabled fantasy scoring rules and published import batches only.' });
  } catch (error) {
    return scoringErrorResponse(error, 'Could not calculate Dino Coach scores. Please try again.');
  }
}

export async function POST(request: Request) {
  const user = await requirePermission('fantasy.home');
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const roundId = String(body?.roundId || '');
  if (!roundId) return NextResponse.json({ success: false, error: 'Round is required.' }, { status: 400 });
  try {
    const season = await resolveSeason(seasonSelector(request, body), { includeNonPublic: true });
    if (!season) throw new ScoringInputError('No Dino Coach season is configured.', 404);
    const preview = await calculateRound(roundId, season.id);
    const calculatedAt = new Date().toISOString();
    const rows = preview.rows.map((row) => ({ manager_id: row.managerId, season_id: preview.seasonId, round_id: roundId, squad_id: row.squadId, total_points: row.totalPoints, transfer_penalty: row.transferPenalty, net_points: row.netPoints, calculated_at: calculatedAt }));
    await replaceRoundScores(preview.seasonId, roundId, rows);
    return NextResponse.json({ success: true, saved: rows.length, preview: preview.rows });
  } catch (error) {
    return scoringErrorResponse(error, 'Could not save Dino Coach scores. Please try again.');
  }
}
