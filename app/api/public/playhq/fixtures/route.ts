import { NextResponse } from 'next/server';
import { getPlayHQPublicData } from '@/lib/playhq/client';
import { getPlayHQConfig } from '@/lib/playhq/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = getPlayHQConfig();
  const data = await getPlayHQPublicData();
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': config.configured ? `public, s-maxage=${config.revalidateSeconds}, stale-while-revalidate=86400` : 'no-store',
    },
  });
}
