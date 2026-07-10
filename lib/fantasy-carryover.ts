// Carry a prior-season squad into a new-season draft. buildCarryoverPlan is
// pure so the warning/validation rules are unit-testable; the API route loads
// data, builds the plan and writes only a target-season draft squad.
import type { FantasyPlayerWithPrice, FantasySettings, SquadSelection } from '@/lib/fantasy-game';

export type SourceSquadPlayer = {
  player_id: string;
  display_name: string;
  role: string;
  price_million: number;
  position_type: 'starter' | 'bench';
  bench_order: number | null;
  is_captain: boolean;
  is_vice_captain: boolean;
};

export type CarryoverPlayerOutcome = {
  playerId: string;
  displayName: string;
  status: 'carried' | 'unavailable';
  reason: string | null;
  sourceRole: string;
  targetRole: string | null;
  roleChanged: boolean;
  sourcePrice: number;
  targetPrice: number | null;
  priceChanged: boolean;
};

export type CarryoverPlan = {
  selection: SquadSelection[];
  carried: CarryoverPlayerOutcome[];
  unavailable: CarryoverPlayerOutcome[];
  roleChanges: CarryoverPlayerOutcome[];
  priceChanges: CarryoverPlayerOutcome[];
  budgetUsed: number;
  budgetRemaining: number;
  warnings: string[];
};

export function buildCarryoverPlan(
  sourcePlayers: SourceSquadPlayer[],
  targetPlayers: FantasyPlayerWithPrice[],
  targetSettings: FantasySettings,
): CarryoverPlan {
  const targetById = new Map(targetPlayers.map((player) => [player.id, player]));
  const outcomes: CarryoverPlayerOutcome[] = sourcePlayers.map((source) => {
    const target = targetById.get(source.player_id);
    if (!target) {
      return {
        playerId: source.player_id,
        displayName: source.display_name,
        status: 'unavailable',
        reason: 'Not available in the target season (missing, inactive, unassigned or not selectable).',
        sourceRole: source.role,
        targetRole: null,
        roleChanged: false,
        sourcePrice: source.price_million,
        targetPrice: null,
        priceChanged: false,
      };
    }
    return {
      playerId: source.player_id,
      displayName: source.display_name,
      status: 'carried',
      reason: null,
      sourceRole: source.role,
      targetRole: target.role,
      roleChanged: target.role !== source.role,
      sourcePrice: source.price_million,
      targetPrice: target.price_million,
      priceChanged: Number(target.price_million.toFixed(1)) !== Number(source.price_million.toFixed(1)),
    };
  });

  const carried = outcomes.filter((outcome) => outcome.status === 'carried');
  const unavailable = outcomes.filter((outcome) => outcome.status === 'unavailable');
  const carriedIds = new Set(carried.map((outcome) => outcome.playerId));

  // Copy captaincy and bench order only when the player made it across; bench
  // order is re-sequenced so gaps left by unavailable players stay valid.
  let benchOrder = 0;
  const selection: SquadSelection[] = sourcePlayers
    .filter((source) => carriedIds.has(source.player_id))
    .map((source) => ({
      playerId: source.player_id,
      positionType: source.position_type,
      benchOrder: source.position_type === 'bench' ? (benchOrder += 1) : null,
      isCaptain: source.is_captain,
      isViceCaptain: source.is_vice_captain,
    }));

  const budgetUsed = Number(carried.reduce((total, outcome) => total + (outcome.targetPrice ?? 0), 0).toFixed(1));
  const warnings: string[] = [];
  for (const outcome of unavailable) warnings.push(`${outcome.displayName} could not be carried: ${outcome.reason}`);
  for (const outcome of carried.filter((item) => item.roleChanged)) warnings.push(`${outcome.displayName} changed role from ${outcome.sourceRole} to ${outcome.targetRole}.`);
  for (const outcome of carried.filter((item) => item.priceChanged)) warnings.push(`${outcome.displayName} price changed from ${outcome.sourcePrice.toFixed(1)} to ${(outcome.targetPrice ?? 0).toFixed(1)}.`);
  if (budgetUsed > targetSettings.squad_budget) warnings.push(`Carried players use ${budgetUsed.toFixed(1)} of a ${targetSettings.squad_budget.toFixed(1)} budget; remove players before submitting.`);

  const captainCarried = selection.some((item) => item.isCaptain);
  const viceCarried = selection.some((item) => item.isViceCaptain);
  if (!captainCarried && sourcePlayers.some((source) => source.is_captain)) warnings.push('Your previous captain is unavailable; pick a new captain before submitting.');
  if (!viceCarried && sourcePlayers.some((source) => source.is_vice_captain)) warnings.push('Your previous vice-captain is unavailable; pick a new vice-captain before submitting.');

  return {
    selection,
    carried,
    unavailable,
    roleChanges: carried.filter((outcome) => outcome.roleChanged),
    priceChanges: carried.filter((outcome) => outcome.priceChanged),
    budgetUsed,
    budgetRemaining: Number((targetSettings.squad_budget - budgetUsed).toFixed(1)),
    warnings,
  };
}
