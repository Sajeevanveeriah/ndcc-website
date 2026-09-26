/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FantasyStatLine } from '@/lib/fantasy-scoring';
import { createServerClient } from '@/lib/supabase-server';
import { fetchAllPages } from '@/lib/fantasy-paging';

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
  role: FantasyRole | 'UNASSIGNED';
  team_label: string | null;
  price_million: number;
  price_dino_dollars: number;
  source_status: string;
  published_at: string | null;
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

const SETTINGS_COLUMNS = 'id, season_name, squad_budget, max_players_per_role, starting_players_required, bench_players_required, free_transfers_per_round, transfer_penalty_points, is_registration_open, is_team_selection_open';

async function resolveDefaultSeasonId(): Promise<string | null> {
  const supabase = createServerClient();
  const { data } = await supabase.from('fantasy_seasons').select('id').eq('is_current', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function getFantasySettings(seasonId?: string | null): Promise<FantasySettings> {
  const supabase = createServerClient();
  const targetSeasonId = seasonId ?? (await resolveDefaultSeasonId());
  if (targetSeasonId) {
    const scoped = await supabase.from('fantasy_settings').select(SETTINGS_COLUMNS).eq('season_id', targetSeasonId).limit(1).maybeSingle();
    if (scoped.error) throw new Error(scoped.error.message);
    if (scoped.data) return normaliseSettings(scoped.data);
  }
  const { data, error } = await supabase
    .from('fantasy_settings')
    .select(SETTINGS_COLUMNS)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normaliseSettings(data);
}

function normaliseSettings(data: any): FantasySettings {
  return {
    id: data?.id || '',
    season_name: data?.season_name || 'NDCC Dino Coach',
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

// Season-scoped player pool: membership, per-season role/availability and
// selectability come from fantasy_season_players; prices from the same season.
// Unassigned or non-selectable season players are excluded from squad building.
export async function getActivePlayersWithLatestPrices(seasonId?: string | null): Promise<FantasyPlayerWithPrice[]> {
  const supabase = createServerClient();
  const targetSeasonId = seasonId ?? (await resolveDefaultSeasonId());
  if (!targetSeasonId) return getActivePlayersWithLatestPricesLegacy();

  const [{ data: memberships, error: memberError }, prices] = await Promise.all([
    supabase
      .from('fantasy_season_players')
      .select('player_id, role, team_label, active, selectable, fantasy_players(id, display_name)')
      .eq('season_id', targetSeasonId)
      .eq('active', true)
      .eq('selectable', true),
    fetchAllPages<any>((from, to) => supabase.from('fantasy_player_prices').select('player_id, price_million, price_dino_dollars, source_status, published_at, created_at').eq('season_id', targetSeasonId).not('published_at', 'is', null).order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)),
  ]);
  if (memberError) throw new Error(memberError.message);

  const priceByPlayer = new Map<string, { legacy: number; dino: number; source: string; published: string | null }>();
  for (const row of prices ?? []) {
    if (!priceByPlayer.has(row.player_id)) priceByPlayer.set(row.player_id, {
      legacy: Number(row.price_million ?? 0), dino: Number(row.price_dino_dollars ?? 0),
      source: row.source_status || 'pending_playhq', published: row.published_at || null,
    });
  }

  return (memberships ?? [])
    .filter((row: any) => row.fantasy_players)
    .map((row: any) => ({
      id: row.player_id,
      display_name: row.fantasy_players.display_name,
      role: row.role as FantasyRole | 'UNASSIGNED',
      team_label: row.team_label,
      price_million: priceByPlayer.get(row.player_id)?.legacy ?? 0,
      price_dino_dollars: priceByPlayer.get(row.player_id)?.dino ?? 0,
      source_status: priceByPlayer.get(row.player_id)?.source ?? 'pending_playhq',
      published_at: priceByPlayer.get(row.player_id)?.published ?? null,
    }))
    .sort((a: FantasyPlayerWithPrice, b: FantasyPlayerWithPrice) => a.display_name.localeCompare(b.display_name));
}

async function getActivePlayersWithLatestPricesLegacy(): Promise<FantasyPlayerWithPrice[]> {
  const supabase = createServerClient();
  const [{ data: players, error: playerError }, prices] = await Promise.all([
    supabase.from('fantasy_players').select('id, display_name, role, team_label').eq('active', true).order('display_name'),
    fetchAllPages<any>((from, to) => supabase.from('fantasy_player_prices').select('player_id, price_million, created_at').order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)),
  ]);
  if (playerError) throw new Error(playerError.message);

  const priceByPlayer = new Map<string, number>();
  for (const row of prices ?? []) {
    if (!priceByPlayer.has(row.player_id)) priceByPlayer.set(row.player_id, Number(row.price_million ?? 0));
  }

  return (players ?? [])
    .filter((player: any) => player.role !== 'UNASSIGNED')
    .map((player: any) => ({
      id: player.id,
      display_name: player.display_name,
      role: player.role,
      team_label: player.team_label,
      price_million: priceByPlayer.get(player.id) ?? 0,
      price_dino_dollars: Math.round((priceByPlayer.get(player.id) ?? 0) * 1000000),
      source_status: 'legacy',
      published_at: null,
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

export type SelectableRound = FantasyRoundInfo & { round_number?: number | null };

const STARTED_ROUND_STATUSES = new Set(['open', 'locked', 'scored', 'final']);

function roundOrder(a: SelectableRound, b: SelectableRound) {
  const numberA = Number.isFinite(Number(a.round_number)) && a.round_number !== null ? Number(a.round_number) : Number.POSITIVE_INFINITY;
  const numberB = Number.isFinite(Number(b.round_number)) && b.round_number !== null ? Number(b.round_number) : Number.POSITIVE_INFINITY;
  if (numberA !== numberB) return numberA - numberB;
  const deadlineA = a.deadline_at ? Date.parse(a.deadline_at) : Number.POSITIVE_INFINITY;
  const deadlineB = b.deadline_at ? Date.parse(b.deadline_at) : Number.POSITIVE_INFINITY;
  return deadlineA - deadlineB;
}

// Pure round selection (tested in scripts/test-fantasy-logic.mjs). Rounds must
// already be limited to one season.
// 1. The lowest-numbered round that is open with no deadline or a future one.
// 2. Otherwise the next upcoming draft round after the latest started round,
//    so the lock reason names the round managers are waiting for.
// 3. Otherwise the latest started round (in progress or season finished),
//    which evaluateRoundLock reports as locked.
export function selectCurrentRound(rounds: SelectableRound[], nowMs: number = Date.now()): FantasyRoundInfo | null {
  const ordered = [...rounds].filter((round) => round?.id).sort(roundOrder);
  if (!ordered.length) return null;
  const pick = (round: SelectableRound): FantasyRoundInfo => ({ id: round.id, name: round.name, status: round.status, deadline_at: round.deadline_at ?? null });

  const open = ordered.find((round) => round.status === 'open' && (!round.deadline_at || Date.parse(round.deadline_at) > nowMs));
  if (open) return pick(open);

  const started = ordered.filter((round) => STARTED_ROUND_STATUSES.has(round.status));
  const latestStarted = started[started.length - 1];
  const upcoming = ordered.find((round) => round.status === 'draft' && (!latestStarted || roundOrder(round, latestStarted) > 0));
  if (upcoming) return pick(upcoming);
  if (latestStarted) return pick(latestStarted);
  return pick(ordered[0]);
}

export async function getCurrentRound(seasonId?: string | null): Promise<FantasyRoundInfo | null> {
  const targetSeasonId = seasonId ?? (await resolveDefaultSeasonId());
  // Never fall back to rounds from other seasons.
  if (!targetSeasonId) return null;
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('fantasy_rounds')
    .select('id, name, status, deadline_at, round_number')
    .eq('season_id', targetSeasonId)
    .order('round_number', { ascending: true });
  if (error) throw new Error(error.message);
  return selectCurrentRound((data ?? []) as SelectableRound[]);
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

export async function getRoundLockState(seasonId?: string | null): Promise<RoundLockState> {
  const targetSeasonId = seasonId ?? (await resolveDefaultSeasonId());
  if (targetSeasonId) {
    const db = createServerClient();
    const settings = await db.from('fantasy_dino_settings').select('selection_window_enabled').eq('season_id', targetSeasonId).maybeSingle();
    if (settings.error) throw new Error(settings.error.message);
    if (settings.data?.selection_window_enabled === true) {
      const window = await db.rpc('dino_coach_transfer_window_open', { target_season_id: targetSeasonId });
      if (window.error) throw new Error(window.error.message);
      const next = await db.from('fantasy_rounds').select('id,name,status,deadline_at')
        .eq('season_id', targetSeasonId).eq('status', 'open')
        .or(`deadline_at.is.null,deadline_at.gt.${new Date().toISOString()}`)
        .order('round_number', { ascending: true }).limit(1).maybeSingle();
      if (next.error) throw new Error(next.error.message);
      if (!next.data) return { roundId: null, roundName: null, locked: true, reason: 'No round is open for team selection.' };
      if (window.data !== true) return { roundId: next.data.id, roundName: next.data.name, locked: true, reason: 'The weekly team-selection window is closed. Check the player market for opening times.' };
      return evaluateRoundLock(next.data);
    }
  }
  const round = await getCurrentRound(seasonId);
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
