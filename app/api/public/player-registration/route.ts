import { NextResponse } from 'next/server';
import { getPublicPlayerRegistration } from '@/lib/public-player-registration';
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
  const data = await getPublicPlayerRegistration();
  // A null answer may be "no current season" or a swallowed read failure, so
  // only a populated registration is shared at the CDN.
  return NextResponse.json({ success: true, data }, { headers: withPublicCdnCache(noStoreHeaders, data !== null) });
}
