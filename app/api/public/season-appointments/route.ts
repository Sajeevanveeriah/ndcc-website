import { NextResponse } from 'next/server';
import { getPublicSeasonAppointments } from '@/lib/public-season-appointments';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET() {
  try {
    const data = await getPublicSeasonAppointments();
    return NextResponse.json({ success: true, data }, { headers: noStoreHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Season appointments are unavailable.';
    return NextResponse.json({ success: false, error: message }, { status: 503, headers: noStoreHeaders });
  }
}
