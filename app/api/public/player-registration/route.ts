import { NextResponse } from 'next/server';
import { getPublicPlayerRegistration } from '@/lib/public-player-registration';

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
  return NextResponse.json({ success: true, data }, { headers: noStoreHeaders });
}
