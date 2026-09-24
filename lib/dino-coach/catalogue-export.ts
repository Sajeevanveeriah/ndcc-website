import { toCsv } from '@/lib/csv';
import type { FantasyPlayerWithPrice } from '@/lib/fantasy-game';
import type { PlayerStats } from './player-stats';

export function catalogueCsv(
  season: { id: string; name: string },
  players: FantasyPlayerWithPrice[],
  stats: Map<string, PlayerStats | null>,
  points: Map<string, { total: number; matches: number }>,
  exportedAt: string,
) {
  return toCsv([
    ['Season', 'Season ID', 'Player ID', 'Player', 'Cricket role', 'Team / grade',
      'Price (Dino Dollars)', 'Price status', 'Price source status', 'Price published at (UTC)',
      'Published season points', 'Published matches counted', 'Points per published match',
      'Stats period', 'Stats source', 'Stats matches', 'Runs', 'Wickets', 'Catches',
      'Stumpings', 'Run outs', 'Maidens', 'Exported at (UTC)'],
    ...players.map(player => {
      const history = stats.get(player.id);
      const score = points.get(player.id);
      return [season.name, season.id, player.id, player.display_name, player.role, player.team_label,
        player.published_at ? player.price_dino_dollars : null,
        player.published_at ? 'Published' : 'Awaiting verified price', player.source_status, player.published_at,
        score?.total, score?.matches, score && score.matches > 0 ? score.total / score.matches : null,
        history?.period, history?.source, history?.matches, history?.runs, history?.wickets,
        history?.catches, history?.stumpings, history?.runouts, history?.maidens, exportedAt];
    }),
  ]);
}
