import { NextResponse } from 'next/server';
import { getPublicSponsors } from '@/lib/public-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET() {
  const result = await getPublicSponsors();
  return NextResponse.json(
    { success: true, data: result.data, source: result.source, degraded: result.degraded, error: result.error },
    { headers: noStoreHeaders },
  );
}
