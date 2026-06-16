import { NextResponse } from 'next/server';
import { getActivePlayersWithLatestPrices, getFantasySettings } from '@/lib/fantasy-game';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [settings, players] = await Promise.all([getFantasySettings(), getActivePlayersWithLatestPrices()]);
    return NextResponse.json({ success: true, settings, players });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not load fantasy players.' }, { status: 500 });
  }
}
