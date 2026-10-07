import { NextResponse } from 'next/server';
import { getCurrentClubSeason } from '@/lib/club-seasons';
import { withPublicCdnCache } from '@/lib/server/public-cdn-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const season = await getCurrentClubSeason();
    return NextResponse.json({ success: true, season }, { headers: withPublicCdnCache({ 'Cache-Control': 'no-store' }, true) });
  } catch {
    return NextResponse.json({ success: false, season: null }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
