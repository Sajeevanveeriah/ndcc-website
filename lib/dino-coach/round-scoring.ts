// Pure squad selection for Dino Coach round scoring (tested in
// scripts/test-dino-round-scoring.mjs). Kept free of imports.
//
// Squads are saved one row per round. A manager who does not touch their team
// for a new round keeps playing the squad they last submitted, so scoring
// carries it forward:
//   1. the manager's submitted/locked squad for this round;
//   2. otherwise their most recent submitted/locked squad from an earlier
//      round of the same season (highest round number, then newest row);
//   3. otherwise their season-wide squad saved without a round (legacy).
// Drafts never score.

export const SCORING_SQUAD_STATUSES = ['submitted', 'locked'] as const;

export type ScoringSquadCandidate = {
  id: string;
  manager_id: string;
  round_id: string | null;
  status: string;
  created_at?: string | null;
};

export type ScoringRoundTarget = {
  roundId: string;
  roundNumber: number | null;
  // round_number for every round of the season, keyed by round id.
  roundNumbers: Map<string, number | null> | Record<string, number | null>;
};

function roundNumberOf(target: ScoringRoundTarget, roundId: string): number | null {
  const value = target.roundNumbers instanceof Map ? target.roundNumbers.get(roundId) : target.roundNumbers[roundId];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function newer(a: ScoringSquadCandidate, b: ScoringSquadCandidate) {
  return String(a.created_at ?? '') > String(b.created_at ?? '');
}

export function selectScoringSquads<T extends ScoringSquadCandidate>(squads: T[], target: ScoringRoundTarget): T[] {
  const statuses = new Set<string>(SCORING_SQUAD_STATUSES);
  const best = new Map<string, { squad: T; rank: number; roundNumber: number }>();
  for (const squad of squads) {
    if (!squad?.id || !squad.manager_id || !statuses.has(squad.status)) continue;
    let rank: number;
    let roundNumber = 0;
    if (squad.round_id === target.roundId) {
      rank = 3;
    } else if (squad.round_id === null || squad.round_id === undefined) {
      rank = 1;
    } else {
      const number = roundNumberOf(target, squad.round_id);
      // Only rounds known to be earlier in this season carry forward.
      if (number === null || target.roundNumber === null || number >= target.roundNumber) continue;
      rank = 2;
      roundNumber = number;
    }
    const current = best.get(squad.manager_id);
    const better = !current
      || rank > current.rank
      || (rank === current.rank && roundNumber > current.roundNumber)
      || (rank === current.rank && roundNumber === current.roundNumber && newer(squad, current.squad));
    if (better) best.set(squad.manager_id, { squad, rank, roundNumber });
  }
  return [...best.values()].map((item) => item.squad).sort((a, b) => a.manager_id.localeCompare(b.manager_id));
}
