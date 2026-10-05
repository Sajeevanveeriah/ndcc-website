/**
 * Snail racing events: entry is by buying named snails at the event's
 * ticket_price each. There is no sales cap; the club adds races to fit the
 * snails sold. Buyers may also sponsor races at race_sponsorship_price each.
 * The database function ndcc_register_event_snail_entry repeats these limits.
 */
export const SNAIL_RACE_LIMITS = Object.freeze({
  // Per order only (request body and payment total limits). Buyers place
  // another order for more; the event itself has no snail limit.
  maxSnailsPerOrder: 200,
  maxSponsorshipsPerOrder: 50,
  // The SnailRace game shows runner names of up to 24 characters.
  snailNameLength: 24,
  playerNameLength: 40,
  maxRaceCount: 100,
  maxSnailsPerRace: 20,
});

export type SnailEntry = { snail_name: string; player_name: string };

export function isSnailRaceEvent(event: { registration_mode?: string | null } | null | undefined): boolean {
  return event?.registration_mode === 'snail_race';
}

const collapse = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Validates and tidies the snails in one order. A blank player name takes the
 * buyer's name, so every snail has someone to cheer for it.
 */
export function normaliseSnailEntries(input: unknown, buyerName: string):
  | { ok: true; value: SnailEntry[] }
  | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'Snail details are invalid.' };
  if (input.length > SNAIL_RACE_LIMITS.maxSnailsPerOrder) {
    return { ok: false, error: `Add up to ${SNAIL_RACE_LIMITS.maxSnailsPerOrder} snails per order. Place another order for more.` };
  }
  const fallbackPlayer = collapse(buyerName).slice(0, SNAIL_RACE_LIMITS.playerNameLength);
  const snails: SnailEntry[] = [];
  for (const [index, item] of input.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: `Snail ${index + 1} is invalid.` };
    }
    const { snail_name: snailName, player_name: playerName } = item as Record<string, unknown>;
    if (typeof snailName !== 'string' || (playerName !== undefined && playerName !== null && typeof playerName !== 'string')) {
      return { ok: false, error: `Snail ${index + 1} is invalid.` };
    }
    const cleanSnail = collapse(snailName);
    const cleanPlayer = (typeof playerName === 'string' ? collapse(playerName) : '') || fallbackPlayer;
    if (!cleanSnail) return { ok: false, error: `Enter a name for snail ${index + 1}.` };
    if (cleanSnail.length > SNAIL_RACE_LIMITS.snailNameLength) {
      return { ok: false, error: `Snail ${index + 1} name must be ${SNAIL_RACE_LIMITS.snailNameLength} characters or fewer.` };
    }
    if (!cleanPlayer) return { ok: false, error: `Enter a player name for snail ${index + 1}.` };
    if (cleanPlayer.length > SNAIL_RACE_LIMITS.playerNameLength) {
      return { ok: false, error: `Snail ${index + 1} player name must be ${SNAIL_RACE_LIMITS.playerNameLength} characters or fewer.` };
    }
    snails.push({ snail_name: cleanSnail, player_name: cleanPlayer });
  }
  return { ok: true, value: snails };
}

export function normaliseSponsorships(input: unknown): { ok: true; value: number } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, value: 0 };
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0) {
    return { ok: false, error: 'Race sponsorships must be a whole number.' };
  }
  if (input > SNAIL_RACE_LIMITS.maxSponsorshipsPerOrder) {
    return { ok: false, error: `Sponsor up to ${SNAIL_RACE_LIMITS.maxSponsorshipsPerOrder} races per order.` };
  }
  return { ok: true, value: input };
}

/**
 * Bulk entry: one snail per line, "Snail name, Player name" (comma, tab or
 * vertical bar). A line without a separator is a snail name only.
 */
export function parseBulkSnailLines(text: string): Array<{ snail_name: string; player_name: string }> {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.*?)\s*[,\t|]\s*(.*)$/);
      return match
        ? { snail_name: collapse(match[1]), player_name: collapse(match[2]) }
        : { snail_name: collapse(line), player_name: '' };
    })
    .filter((entry) => entry.snail_name);
}

/** Positive whole number from a settings column, or null when not set. */
export function snailRaceSetting(value: unknown, max: number): number | null {
  const number = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof number === 'number' && Number.isSafeInteger(number) && number >= 1 && number <= max ? number : null;
}

/**
 * Suggested race card. Races are filled up to the snails-per-race setting, so
 * extra sales add races and slow sales never leave one-snail races. Snails
 * are dealt across the races in purchase order (snail 1 to race 1, snail 2 to
 * race 2, ...), so one buyer's snails are spread out rather than racing each
 * other and the fields stay even. Without a snails-per-race setting the
 * planned race count is used, keeping at least two snails in each race.
 */
export function allocateRaces<T>(snails: T[], snailsPerRace: number | null, plannedRaces: number | null): T[][] {
  if (snails.length === 0) return [];
  const perRace = snailsPerRace && snailsPerRace > 0 ? snailsPerRace : null;
  const raceCount = perRace
    ? Math.ceil(snails.length / perRace)
    : Math.max(1, Math.min(plannedRaces ?? 1, Math.floor(snails.length / 2)));
  const races: T[][] = Array.from({ length: raceCount }, () => []);
  snails.forEach((snail, index) => races[index % raceCount].push(snail));
  return races;
}
