import { NextResponse } from 'next/server';
import { getDinoSelectionBadges } from '@/lib/server/match-day';

export const dynamic = 'force-dynamic';

/** Dino Coach: which players are named on this week's published team sheets (player id -> team, date, round). */
export async function GET() {
  try {
    return NextResponse.json({ success: true, selections: await getDinoSelectionBadges() }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } });
  } catch {
    return NextResponse.json({ success: false, selections: {} }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
