// Pure, deterministic matching helpers for the fantasy PlayHQ orchestrator:
// season-name normalisation, season matching and NDCC club-team detection.
// No I/O — unit tested in scripts/test-fantasy-orchestrator.mjs.
import type { PlayHQSeason } from './types';

/** Centralised, testable club identity aliases. Deliberately narrow: every
 *  alias contains the distinctive token "newcomb" (or the exact acronym) so a
 *  broad match can never capture another club. */
export const CLUB_TEAM_ALIASES = [
  'newcomb',
  'newcomb and district',
  'newcomb & district',
  'newcomb district',
  'ndcc',
] as const;

export function normaliseClubText(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** True when a PlayHQ team name belongs to NDCC. Word-boundary match on the
 *  distinctive token so "Newcomb Gold" / "Newcomb & District CC 2nd XI" match
 *  but no other club can. */
export function isClubTeamName(teamName: string | null | undefined): boolean {
  const normalised = normaliseClubText(teamName);
  if (!normalised) return false;
  const words = normalised.split(' ');
  return words.includes('newcomb') || words.includes('ndcc');
}

/** Extract the [startYear, endYear] pair from a season label.
 *  Supports "2025/26", "2025-26", "2025 2026", "Season 2025/2026",
 *  "Summer 2025/26" and a bare "2025" (treated as 2025/26 — southern-
 *  hemisphere cricket seasons span the new year). Returns null when no
 *  4-digit year is present. */
export function extractSeasonYears(label: string | null | undefined): [number, number] | null {
  const text = String(label ?? '');
  const pair = text.match(/(\d{4})\s*(?:[/\-–—]|\s)\s*(\d{2,4})/);
  if (pair) {
    const start = Number(pair[1]);
    let end = Number(pair[2]);
    if (pair[2].length === 2) end = Math.floor(start / 100) * 100 + end;
    if (end === start + 1) return [start, end];
    if (end === start) return [start, start + 1];
  }
  const single = text.match(/(\d{4})/);
  if (single) {
    const start = Number(single[1]);
    return [start, start + 1];
  }
  return null;
}

export type SeasonMatchResult =
  | { status: 'matched'; season: PlayHQSeason; evidence: string }
  | { status: 'ambiguous'; candidates: PlayHQSeason[]; evidence: string }
  | { status: 'none'; evidence: string };

/** Match a local fantasy season (by slug/name years) against the PlayHQ
 *  organisation season list. Date ranges are used as secondary validation:
 *  a candidate whose dates clearly contradict the year pair is excluded. */
export function matchPlayHQSeason(
  playhqSeasons: PlayHQSeason[],
  local: { slug: string; name?: string | null }
): SeasonMatchResult {
  const localYears = extractSeasonYears(local.slug) ?? extractSeasonYears(local.name);
  if (!localYears) {
    return { status: 'none', evidence: `Could not derive season years from "${local.slug}" / "${local.name ?? ''}".` };
  }

  const candidates = playhqSeasons.filter((season) => {
    const years = extractSeasonYears(season.name);
    if (!years || years[0] !== localYears[0] || years[1] !== localYears[1]) return false;
    // Secondary date validation: the season must start in the first year
    // (± one calendar year of slack for pre-season fixtures) when dates exist.
    if (season.startDate) {
      const startYear = Number(String(season.startDate).slice(0, 4));
      if (Number.isFinite(startYear) && Math.abs(startYear - localYears[0]) > 1) return false;
    }
    return true;
  });

  if (candidates.length === 1) {
    return {
      status: 'matched',
      season: candidates[0],
      evidence: `Matched PlayHQ season "${candidates[0].name}" (${candidates[0].id}) to local ${local.slug} by season years ${localYears[0]}/${localYears[1]}.`,
    };
  }
  if (candidates.length > 1) {
    return {
      status: 'ambiguous',
      candidates,
      evidence: `${candidates.length} PlayHQ seasons match years ${localYears[0]}/${localYears[1]}: ${candidates.map((c) => `${c.name} (${c.id})`).join(', ')}.`,
    };
  }
  return { status: 'none', evidence: `No PlayHQ season matched years ${localYears[0]}/${localYears[1]}.` };
}
