import { NextResponse } from 'next/server';
import { resolveRequestSeason } from '@/lib/fantasy-seasons';
import { getDinoManagerStandings } from '@/lib/dino-coach/standings';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const season = await resolveRequestSeason(request);
    const rows = await getDinoManagerStandings(season?.id ?? null);
    return NextResponse.json({ success: true, season, rows });
  } catch (error) {
    console.error('[fantasy/manager-leaderboard] Failed to load standings:', error);
    return NextResponse.json({ success: false, error: 'Failed to load leaderboard.' }, { status: 503 });
  }
}
