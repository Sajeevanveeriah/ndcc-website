import { NextResponse } from 'next/server';
import { getClubSettings } from '@/lib/club-settings';

export const revalidate = 300;
export const preferredRegion = 'syd1';

export async function GET() {
  const data = await getClubSettings();
  return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } });
}
