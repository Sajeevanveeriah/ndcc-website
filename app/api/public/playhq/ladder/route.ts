import { NextResponse } from 'next/server';
import { getPlayHQPublicData } from '@/lib/playhq/client';
import { getPlayHQConfig } from '@/lib/playhq/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = getPlayHQConfig();
  const data = await getPlayHQPublicData();
  return NextResponse.json({ configured: data.configured, selectedSeasonId: data.selectedSeasonId, grades: data.grades, ladders: data.ladders, message: data.message, error: data.error }, {
    headers: {
      'Cache-Control': config.configured ? `public, s-maxage=${Math.min(config.revalidateSeconds,300)}, stale-while-revalidate=300` : 'no-store',
    },
  });
}
