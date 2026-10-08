import type { PlayerStats } from './player-stats';

// A manager's own Dino Coach team, laid out by slot. Teams are private: the
// team view only ever returns the signed-in manager's own squad.

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
