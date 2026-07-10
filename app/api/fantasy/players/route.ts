import { NextResponse } from 'next/server';
import { getActivePlayersWithLatestPrices, getFantasySettings } from '@/lib/fantasy-game';
import { resolveRequestSeason } from '@/lib/fantasy-seasons';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const season = await resolveRequestSeason(request);
    if (!season) return NextResponse.json({ success: false, error: 'No fantasy season is available.' }, { status: 404 });
    const [settings, players] = await Promise.all([getFantasySettings(season.id), getActivePlayersWithLatestPrices(season.id)]);
    return NextResponse.json({ success: true, season, settings, players });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not load fantasy players.' }, { status: 500 });
  }
}
