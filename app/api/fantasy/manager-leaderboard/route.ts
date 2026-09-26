import { NextResponse } from 'next/server';
import { getCachedManagerStandings, resolveCachedRequestSeason } from '@/lib/server/dino-public-cache';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const season = await resolveCachedRequestSeason(request);
    const rows = await getCachedManagerStandings(season?.id ?? null);
    return NextResponse.json({ success: true, season, rows });
  } catch (error) {
    console.error('[fantasy/manager-leaderboard] Failed to load standings:', error);
    return NextResponse.json({ success: false, error: 'Failed to load leaderboard.' }, { status: 503 });
  }
}
