import type { PlayerStats } from './player-stats';

// Viewing another manager's Dino Coach team. Squads are saved one row per
// round and are fixed once that round's deadline passes, so a rival is shown
// with the squad that counts for the latest locked round, never their live
// edits for a round still open. The weekly selection window and committee
// switches play no part: they can reopen before a deadline.

export type RevealRound = { id: string; name: string; round_number: number | null; status: string; deadline_at: string | null };

const CLOSED_ROUND_STATUSES = new Set(['locked', 'scored', 'final']);

/** The latest round whose squads are fixed for good: closed, or open with its deadline passed. */
export function latestLockedRound(rounds: RevealRound[], nowMs: number = Date.now()): RevealRound | null {
  const locked = rounds.filter((round) => CLOSED_ROUND_STATUSES.has(round.status)
    || (round.status === 'open' && round.deadline_at !== null && Date.parse(round.deadline_at) <= nowMs));
  const order = (round: RevealRound) => [round.round_number ?? Number.NEGATIVE_INFINITY, round.deadline_at ? Date.parse(round.deadline_at) : Number.NEGATIVE_INFINITY];
  return locked.sort((a, b) => { const [an, ad] = order(a); const [bn, bd] = order(b); return bn - an || bd - ad; })[0] ?? null;
}

/** A finished season's squads can no longer change, so its latest squads are shown. */
export function seasonFinished(status: string): boolean {
  return status === 'completed' || status === 'archived';
}

export const TEAMS_HIDDEN_MESSAGE = 'Other teams are revealed once the first round deadline passes. Check back after the deadline.';

export type TeamViewPlayer = {
  id: string;
  display_name: string;
  role: string;
  team_label: string | null;
  price_dino_dollars: number;
  published_at: string | null;
  stats?: PlayerStats | null;
};

export type TeamViewSlot = { key: string; label: string; positionType: 'starter' | 'bench'; order: number };

export type SquadPickRow = {
  player_id: string;
  slot_key: string;
  assigned_role: string;
  position_type: string;
  is_captain: boolean;
  is_vice_captain: boolean;
  purchase_price_dino_dollars: number | string | null;
  fantasy_players?: { display_name?: string | null } | Array<{ display_name?: string | null }> | null;
};

export type TeamViewPick = {
  slotKey: string;
  slotLabel: string;
  positionType: 'starter' | 'bench';
  assignedRole: string;
  isCaptain: boolean;
  isViceCaptain: boolean;
  purchasePriceDinoDollars: number;
  playerId: string;
  displayName: string;
  // Null when the player has left this season's pool; the pick still shows by name.
  player: TeamViewPlayer | null;
};

export type TeamView = {
  managerId: string;
  teamName: string;
  displayName: string;
  rank: number | null;
  totalPoints: number;
  squadValueDinoDollars: number;
  // The locked round this squad is shown for; null for a live or finished-season squad.
  roundName: string | null;
  picks: TeamViewPick[];
};

/** Orders saved picks by the season's slot layout, playing XI first, then bench. */
export function buildTeamPicks(rows: SquadPickRow[], slots: TeamViewSlot[], players: Map<string, TeamViewPlayer>): TeamViewPick[] {
  const slotByKey = new Map(slots.map((slot) => [slot.key, slot]));
  return rows.map((row): TeamViewPick => {
    const slot = slotByKey.get(row.slot_key);
    const joined = Array.isArray(row.fantasy_players) ? row.fantasy_players[0] : row.fantasy_players;
    const player = players.get(row.player_id) ?? null;
    return {
      slotKey: row.slot_key,
      slotLabel: slot?.label ?? row.slot_key,
      positionType: (slot?.positionType ?? (row.position_type === 'bench' ? 'bench' : 'starter')) as 'starter' | 'bench',
      assignedRole: row.assigned_role,
      isCaptain: row.is_captain === true,
      isViceCaptain: row.is_vice_captain === true,
      purchasePriceDinoDollars: Number(row.purchase_price_dino_dollars ?? 0),
      playerId: row.player_id,
      displayName: player?.display_name || joined?.display_name || 'Former player',
      player,
    };
  }).sort((a, b) => (a.positionType === b.positionType ? 0 : a.positionType === 'starter' ? -1 : 1)
    || (slotByKey.get(a.slotKey)?.order ?? Number.MAX_SAFE_INTEGER) - (slotByKey.get(b.slotKey)?.order ?? Number.MAX_SAFE_INTEGER));
}

/** Current market value: latest published price of every player still in the pool. */
export function squadMarketValue(picks: TeamViewPick[]): number {
  return picks.reduce((sum, pick) => sum + (pick.player?.published_at ? Number(pick.player.price_dino_dollars) || 0 : 0), 0);
}

/** Player ids owned by both squads, for the compare view. */
export function sharedPlayerIds(a: TeamViewPick[], b: TeamViewPick[]): Set<string> {
  const other = new Set(b.map((pick) => pick.playerId));
  return new Set(a.map((pick) => pick.playerId).filter((id) => other.has(id)));
}
