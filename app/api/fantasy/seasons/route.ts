import { NextResponse } from 'next/server';
import { getFantasySeasons, seasonStatusLabel } from '@/lib/fantasy-seasons';

export const dynamic = 'force-dynamic';

// Public fantasy seasons for client-side pickers (season selector, carryover).
export async function GET() {
  try {
    const seasons = await getFantasySeasons();
    return NextResponse.json({
      success: true,
      seasons: seasons.map((season) => ({
        id: season.id,
        slug: season.slug,
        name: season.name,
        status: season.status,
        statusLabel: seasonStatusLabel(season),
        is_current: season.is_current,
        allow_team_building: season.allow_team_building,
        team_selection_open: season.team_selection_open,
      })),
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not load seasons.' }, { status: 500 });
  }
}
