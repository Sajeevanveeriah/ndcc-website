import { NextResponse } from 'next/server';
import { getActivePlayersWithLatestPrices } from '@/lib/fantasy-game';
import { getPublishedFantasyLeaderboard } from '@/lib/fantasy-leaderboard';
import { resolveRequestSeason } from '@/lib/fantasy-seasons';
import { getPlayerStats } from '@/lib/dino-coach/player-stats-server';
import { catalogueCsv } from '@/lib/dino-coach/catalogue-export';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const season = await resolveRequestSeason(request);
    if (!season) return NextResponse.json({ error: 'No public Dino Coach season is available.' }, { status: 404, headers });
    // Do not silently export a different season if a saved export link is stale.
    const selected = new URL(request.url).searchParams.get('season')?.trim();
    if (selected && selected !== season.id && selected !== season.slug) {
      return NextResponse.json({ error: 'That public Dino Coach season is unavailable.' }, { status: 404, headers });
    }
    const players = await getActivePlayersWithLatestPrices(season.id);
    const [stats, leaderboard] = await Promise.all([
      getPlayerStats(season.id, players), getPublishedFantasyLeaderboard(null, season.id),
    ]);
    const points = new Map(leaderboard.rows.map(row => [row.playerId, { total: row.totalFantasyPoints, matches: row.matchesCounted }]));
    const exportedAt = new Date().toISOString();
    const slug = season.slug.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
    return new Response(catalogueCsv(season, players, stats, points, exportedAt), {
      headers: {
        ...headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="dino-coach-players-${slug}-${exportedAt.slice(0, 10)}.csv"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[fantasy/players/export] Catalogue export failed:', error);
    return NextResponse.json({ error: 'Could not export the catalogue. Please try again.' }, { status: 503, headers });
  }
}
