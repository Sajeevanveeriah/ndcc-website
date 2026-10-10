/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only';
import { calculateAssignedRolePoints } from '@/lib/dino-coach/domain';
import { getDinoCoachSettings } from '@/lib/dino-coach/server';
import { SCORING_SQUAD_STATUSES, applyBenchCover, selectScoringSquads } from '@/lib/dino-coach/round-scoring';
import { fetchAllPages } from '@/lib/fantasy-paging';
import { createServerClient } from '@/lib/supabase-server';

// Round scoring shared by the admin scores route (preview and save) and the
// PlayHQ sync, which re-scores every round it publishes stats for.
export class ScoringInputError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const SQUAD_DETAIL_CHUNK = 200;

export async function calculateRound(roundId: string, expectedSeasonId: string | null) {
  const supabase = createServerClient();
  const { data: round, error: roundError } = await supabase.from('fantasy_rounds').select('id, season_id, round_number').eq('id', roundId).maybeSingle();
  if (roundError) throw new Error(roundError.message);
  if (!round) throw new ScoringInputError('Round not found.', 404);
  if (expectedSeasonId && round.season_id !== expectedSeasonId) throw new ScoringInputError('That round is not part of the selected season.');
  const seasonId = round.season_id as string;
  const { data: stats, error: statsError } = await supabase
    .from('fantasy_match_stats')
    .select('round_id, player_id, match_date, opponent, runs, wickets, maidens, catches, runouts, stumpings, hat_tricks, ducks, not_out, player_of_match, fantasy_rounds(round_number), fantasy_players(display_name), fantasy_import_batches!inner(status)')
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

  // Light candidate list first (every saved squad of active managers this
  // season, drafts included), then full details only for the chosen squads.
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
      .select('id, manager_id, round_id, season_id, status, fantasy_managers!inner(display_name, team_name, is_active, deleted_at), fantasy_squad_players(player_id, slot_key, position_type, assigned_role, is_captain, is_vice_captain, fantasy_players(display_name))')
      .in('id', chosenIds.slice(index, index + SQUAD_DETAIL_CHUNK));
    if (squadError) throw new Error(squadError.message);
    squads.push(...(data ?? []));
  }

  const result = squads.map((squad: any) => {
    let total = 0;
    const { starters, promoted } = applyBenchCover<any>(squad.fantasy_squad_players ?? [], dinoSettings.slot_counts.starter);
    for (const squadPlayer of starters) {
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
      squadStatus: squad.status as string,
      startersCounted: starters.length,
      benchCover: promoted.map((player: any) => player.fantasy_players?.display_name || 'Bench player'),
    };
  }).sort((a, b) => b.netPoints - a.netPoints);
  return { seasonId, rows: result };
}

function isMissingFunction(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function|function .* does not exist/i.test(error.message || '')));
}

// Replace the round's saved scores: upsert recalculated rows and remove rows for
// managers no longer scored, atomically via replace_dino_coach_round_scores.
export async function replaceRoundScores(seasonId: string, roundId: string, rows: Array<Record<string, unknown>>) {
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


/** Calculate and save one round's manager scores; returns the rows saved. */
export async function saveRoundScores(roundId: string, expectedSeasonId: string | null) {
  const preview = await calculateRound(roundId, expectedSeasonId);
  const calculatedAt = new Date().toISOString();
  const rows = preview.rows.map((row) => ({ manager_id: row.managerId, season_id: preview.seasonId, round_id: roundId, squad_id: row.squadId, total_points: row.totalPoints, transfer_penalty: row.transferPenalty, net_points: row.netPoints, calculated_at: calculatedAt }));
  await replaceRoundScores(preview.seasonId, roundId, rows);
  return { seasonId: preview.seasonId, rows, preview: preview.rows };
}
