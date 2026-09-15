import { calculateInitialPrice, normalisePlayerIdentity } from './domain';

export type SummaryRow = { name: string; grade: string; row: number; runs: number; wickets: number; catches: number; stumpings: number; matches: number | null };
export const CRICKET_ROLE_LABELS: Record<string, string> = { BAT: 'Batter', BOWL: 'Bowler', AR: 'All-rounder', WK: 'Wicket keeper', UNASSIGNED: 'Not yet classified' };

// Season totals cannot support per-innings milestone or not-out bonuses.
// Missing match counts are never silently replaced with zero appearances.
export function aggregateSeasonSummary(rows: SummaryRow[]) {
  const grouped = new Map<string, { name: string; runs: number; wickets: number; catches: number; stumpings: number; matches: number; completeMatches: boolean; grades: string[] }>();
  const seen = new Set<string>();
  for (const row of rows) {
    const key = normalisePlayerIdentity(row.name);
    const sourceKey = `${key}:${row.grade}`;
    if (!key || seen.has(sourceKey)) throw new Error('Duplicate or empty player/grade identity.');
    seen.add(sourceKey);
    for (const value of [row.runs, row.wickets, row.catches, row.stumpings]) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid season summary statistic.');
    }
    if (row.matches !== null && (!Number.isSafeInteger(row.matches) || row.matches < 0)) throw new Error('Invalid match count.');
    const item = grouped.get(key) || { name: row.name, runs: 0, wickets: 0, catches: 0, stumpings: 0, matches: 0, completeMatches: true, grades: [] };
    item.runs += row.runs; item.wickets += row.wickets; item.catches += row.catches; item.stumpings += row.stumpings;
    item.matches += row.matches ?? 0; item.completeMatches &&= row.matches !== null; item.grades.push(row.grade);
    grouped.set(key, item);
  }
  return [...grouped.values()].map((item) => ({ ...item, points: item.runs + 10 * (item.wickets + item.catches + item.stumpings) }));
}

export function inferCricketRole(name: string, runs: number, wickets: number, keepers: string[]) {
  if (keepers.some((keeper) => normalisePlayerIdentity(keeper) === normalisePlayerIdentity(name))) return 'WK';
  if (runs === 0 && wickets === 0) return 'UNASSIGNED';
  const bowling = wickets * 10;
  const share = bowling / (runs + bowling);
  if (runs >= 50 && wickets >= 3 && share >= 0.2 && share <= 0.8) return 'AR';
  return bowling > runs ? 'BOWL' : 'BAT';
}

export function summaryOpeningPrice(points: number, bestPoints: number) {
  return calculateInitialPrice(points, bestPoints, 500_000, 2_000_000);
}
