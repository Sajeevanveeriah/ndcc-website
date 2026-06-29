import { NextResponse } from 'next/server';
import { getPublicSponsors } from '@/lib/public-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await getPublicSponsors();
  return NextResponse.json({ success: true, data: result.data, source: result.source, degraded: result.degraded, error: result.error });
}
