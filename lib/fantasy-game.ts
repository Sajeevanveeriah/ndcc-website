/* eslint-disable @typescript-eslint/no-explicit-any */
import { calculateFantasyPoints, type FantasyScoringRule, type FantasyStatLine } from '@/lib/fantasy-scoring';
import { createServerClient } from '@/lib/supabase-server';

export const ROLE_LIMITS = { WK: 2, BAT: 5, AR: 3, BOWL: 5 } as const;
export const STARTER_MINIMUMS = { WK: 1, BAT: 3, AR: 1, BOWL: 3 } as const;
export const CHIP_TYPES = ['wildcard', 'free_hit', 'bench_boost', 'triple_captain'] as const;

export type FantasyRole = keyof typeof ROLE_LIMITS;
export type ChipType = (typeof CHIP_TYPES)[number];

export type FantasySettings = {
  id: string;
  season_name: string;
  squad_budget: number;
  max_players_per_role: Record<FantasyRole, number>;
  starting_players_required: number;
  bench_players_required: number;
  free_transfers_per_round: number;
  transfer_penalty_points: number;
  is_registration_open: boolean;
  is_team_selection_open: boolean;
};

export type FantasyPlayerWithPrice = {
  id: string;
  display_name: string;
  role: FantasyRole;
  team_label: string | null;
  price_million: number;
};

export type SquadSelection = {
  playerId: string;
  positionType: 'starter' | 'bench';
  benchOrder: number | null;
  isCaptain: boolean;
  isViceCaptain: boolean;
};

export type SquadValidationResult = {
  valid: boolean;
  errors: string[];
  budgetUsed: number;
};

export async function getFantasySettings(): Promise<FantasySettings> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('fantasy_settings')
    .select('id, season_name, squad_budget, max_players_per_role, starting_players_required, bench_players_required, free_transfers_per_round, transfer_penalty_points, is_registration_open, is_team_selection_open')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normaliseSettings(data);
}

function normaliseSettings(data: any): FantasySettings {
  return {
    id: data?.id || '',
    season_name: data?.season_name || 'NDCC Fantasy Cricket',
    squad_budget: Number(data?.squad_budget ?? 100),
    max_players_per_role: { ...ROLE_LIMITS, ...(data?.max_players_per_role || {}) },
    starting_players_required: Number(data?.starting_players_required ?? 11),
    bench_players_required: Number(data?.bench_players_required ?? 4),
    free_transfers_per_round: Number(data?.free_transfers_per_round ?? 1),
    transfer_penalty_points: Number(data?.transfer_penalty_points ?? 4),
    is_registration_open: data?.is_registration_open !== false,
    is_team_selection_open: data?.is_team_selection_open !== false,
  };
}

export async function getActivePlayersWithLatestPrices(): Promise<FantasyPlayerWithPrice[]> {
  const supabase = createServerClient();
  const [{ data: players, error: playerError }, { data: prices, error: priceError }] = await Promise.all([
    supabase.from('fantasy_players').select('id, display_name, role, team_label').eq('active', true).order('display_name'),
    supabase.from('fantasy_player_prices').select('player_id, price_million, created_at').order('created_at', { ascending: false }),
  ]);
  if (playerError) throw new Error(playerError.message);
  if (priceError) throw new Error(priceError.message);

  const priceByPlayer = new Map<string, number>();
  for (const row of prices ?? []) {
    if (!priceByPlayer.has(row.player_id)) priceByPlayer.set(row.player_id, Number(row.price_million ?? 0));
  }

  return (players ?? []).map((player: any) => ({
    id: player.id,
    display_name: player.display_name,
    role: player.role,
    team_label: player.team_label,
    price_million: priceByPlayer.get(player.id) ?? 0,
  }));
}

export type FantasyRoundInfo = {
  id: string;
  name: string;
  status: string;
  deadline_at: string | null;
};

export type RoundLockState = {
  roundId: string | null;
  roundName: string | null;
  locked: boolean;
  reason: string | null;
};

export async function getCurrentRound(): Promise<FantasyRoundInfo | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('fantasy_rounds')
    .select('id, name, status, deadline_at')
    .in('status', ['open', 'locked', 'scored'])
    .order('round_number', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.id) return data as FantasyRoundInfo;

  const fallback = await supabase.from('fantasy_rounds').select('id, name, status, deadline_at').order('round_number', { ascending: true }).limit(1).maybeSingle();
  if (fallback.error) throw new Error(fallback.error.message);
  return (fallback.data as FantasyRoundInfo | null) ?? null;
}

export async function getCurrentRoundId() {
  const round = await getCurrentRound();
  return round?.id ?? null;
}

// Pure deadline/lock evaluation so the rule is deterministic and unit-testable
// (scripts/test-fantasy-logic.mjs) independent of the Supabase read.
export function evaluateRoundLock(round: FantasyRoundInfo | null, nowMs: number = Date.now()): RoundLockState {
  if (!round) return { roundId: null, roundName: null, locked: false, reason: null };

  if (round.status !== 'open') {
    return { roundId: round.id, roundName: round.name, locked: true, reason: `${round.name} is not open for team changes.` };
  }
  if (round.deadline_at && new Date(round.deadline_at).getTime() <= nowMs) {
    return { roundId: round.id, roundName: round.name, locked: true, reason: `The deadline for ${round.name} has passed, so team changes are locked.` };
  }
  return { roundId: round.id, roundName: round.name, locked: false, reason: null };
}

export async function getRoundLockState(): Promise<RoundLockState> {
  const round = await getCurrentRound();
  return evaluateRoundLock(round);
}

export function validateSquadSelection(selection: SquadSelection[], players: FantasyPlayerWithPrice[], settings: FantasySettings): SquadValidationResult {
  const errors: string[] = [];
  const playerById = new Map(players.map((player) => [player.id, player]));
  const ids = selection.map((item) => item.playerId).filter(Boolean);
  const uniqueIds = new Set(ids);
  if (selection.length !== settings.starting_players_required + settings.bench_players_required) errors.push(`Squad must contain ${settings.starting_players_required + settings.bench_players_required} players.`);
  if (uniqueIds.size !== ids.length) errors.push('Squad cannot contain duplicate players.');

  const selectedPlayers = selection.map((item) => playerById.get(item.playerId));
  if (selectedPlayers.some((player) => !player)) errors.push('Squad can only include active fantasy players.');

  const starters = selection.filter((item) => item.positionType === 'starter');
  const bench = selection.filter((item) => item.positionType === 'bench');
  if (starters.length !== settings.starting_players_required) errors.push(`Starting XI must contain ${settings.starting_players_required} players.`);
  if (bench.length !== settings.bench_players_required) errors.push(`Bench must contain ${settings.bench_players_required} players.`);

  const budgetUsed = selectedPlayers.reduce((total, player) => total + (player?.price_million ?? 0), 0);
  if (budgetUsed > settings.squad_budget) errors.push(`Budget used ${budgetUsed.toFixed(1)} exceeds ${settings.squad_budget.toFixed(1)}.`);

  for (const role of Object.keys(settings.max_players_per_role) as FantasyRole[]) {
    const count = selectedPlayers.filter((player) => player?.role === role).length;
    if (count !== settings.max_players_per_role[role]) errors.push(`Squad must include exactly ${settings.max_players_per_role[role]} ${role} player${settings.max_players_per_role[role] === 1 ? '' : 's'}.`);
  }

  for (const [role, minimum] of Object.entries(STARTER_MINIMUMS) as [FantasyRole, number][]) {
    const count = starters.filter((item) => playerById.get(item.playerId)?.role === role).length;
    if (count < minimum) errors.push(`Starting XI must include at least ${minimum} ${role} player${minimum === 1 ? '' : 's'}.`);
  }

  const captains = selection.filter((item) => item.isCaptain);
  const viceCaptains = selection.filter((item) => item.isViceCaptain);
  if (captains.length !== 1) errors.push('One captain is required.');
  if (viceCaptains.length !== 1) errors.push('One vice-captain is required.');
  if (captains[0]?.playerId && captains[0]?.playerId === viceCaptains[0]?.playerId) errors.push('Captain and vice-captain cannot be the same player.');
  if (captains[0] && captains[0].positionType !== 'starter') errors.push('Captain must be in the starting XI.');
  if (viceCaptains[0] && viceCaptains[0].positionType !== 'starter') errors.push('Vice-captain must be in the starting XI.');

  const benchOrders = bench.map((item) => item.benchOrder);
  if (benchOrders.some((order) => !Number.isInteger(order) || (order ?? 0) < 1 || (order ?? 0) > settings.bench_players_required)) errors.push('Bench order 1 to 4 is required for all bench players.');
  if (new Set(benchOrders).size !== benchOrders.length) errors.push('Bench order cannot contain duplicates.');

  return { valid: errors.length === 0, errors, budgetUsed: Number(budgetUsed.toFixed(1)) };
}

// Draft saves accept an in-progress squad: players must be real/active and
// within budget and role caps, but the squad may be incomplete and captaincy,
// bench order, and starter minimums are not yet required. Full rules apply at
// submit time via validateSquadSelection.
export function validateDraftSquadSelection(selection: SquadSelection[], players: FantasyPlayerWithPrice[], settings: FantasySettings): SquadValidationResult {
  const errors: string[] = [];
  const playerById = new Map(players.map((player) => [player.id, player]));
  const ids = selection.map((item) => item.playerId).filter(Boolean);
  const uniqueIds = new Set(ids);
  const maxSquadSize = settings.starting_players_required + settings.bench_players_required;

  if (selection.length === 0) errors.push('Select at least one player before saving a draft.');
  if (selection.length > maxSquadSize) errors.push(`Squad cannot contain more than ${maxSquadSize} players.`);
  if (uniqueIds.size !== ids.length) errors.push('Squad cannot contain duplicate players.');

  const selectedPlayers = selection.map((item) => playerById.get(item.playerId));
  if (selectedPlayers.some((player) => !player)) errors.push('Squad can only include active fantasy players.');

  const budgetUsed = selectedPlayers.reduce((total, player) => total + (player?.price_million ?? 0), 0);
  if (budgetUsed > settings.squad_budget) errors.push(`Budget used ${budgetUsed.toFixed(1)} exceeds ${settings.squad_budget.toFixed(1)}.`);

  for (const role of Object.keys(settings.max_players_per_role) as FantasyRole[]) {
    const count = selectedPlayers.filter((player) => player?.role === role).length;
    if (count > settings.max_players_per_role[role]) errors.push(`Squad cannot include more than ${settings.max_players_per_role[role]} ${role} player${settings.max_players_per_role[role] === 1 ? '' : 's'}.`);
  }

  return { valid: errors.length === 0, errors, budgetUsed: Number(budgetUsed.toFixed(1)) };
}

export async function getEnabledScoringRules() {
  const supabase = createServerClient();
  const { data, error } = await supabase.from('fantasy_scoring_rules').select('key, points, enabled').eq('enabled', true);
  if (error) throw new Error(error.message);
  return (data ?? []) as FantasyScoringRule[];
}

export function statLineFromRecord(row: any): FantasyStatLine {
  return {
    round_number: Number(row.fantasy_rounds?.round_number ?? 0),
    match_date: row.match_date || '',
    opponent: row.opponent || '',
    player_name: row.fantasy_players?.display_name || 'Unknown player',
    runs: Number(row.runs ?? 0),
    wickets: Number(row.wickets ?? 0),
    maidens: Number(row.maidens ?? 0),
    catches: Number(row.catches ?? 0),
    runouts: Number(row.runouts ?? 0),
    stumpings: Number(row.stumpings ?? 0),
    ducks: Number(row.ducks ?? 0),
    not_out: row.not_out === true,
    player_of_match: row.player_of_match === true,
  };
}

export function calculatePlayerStatPoints(row: any, rules: FantasyScoringRule[]) {
  return calculateFantasyPoints(statLineFromRecord(row), rules);
}
