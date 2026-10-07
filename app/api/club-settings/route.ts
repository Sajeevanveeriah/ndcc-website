import { NextResponse } from 'next/server';
import { getClubSettings } from '@/lib/club-settings';
import { fallbackClubSettings } from '@/lib/club-settings-types';
import { withPublicCdnCache } from '@/lib/server/public-cdn-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET() {
  const data = await getClubSettings();
  // getClubSettings answers the shared fallback object when the read fails or
  // Supabase is unconfigured; only a live row is shared at the CDN.
  return NextResponse.json({ success: true, data }, { headers: withPublicCdnCache(noStoreHeaders, data !== fallbackClubSettings) });
}
