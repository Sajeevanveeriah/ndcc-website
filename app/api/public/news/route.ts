import { NextResponse } from 'next/server';
import { getPublishedNews } from '@/lib/public-news';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ success: false, error: 'Service not configured.' }, { status: 503, headers: noStoreHeaders });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const limitParam = searchParams.get('limit');
  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
  const limit = Number.isFinite(parsedLimit) && parsedLimit && parsedLimit > 0 ? parsedLimit : undefined;

  try {
    if (id) {
      const data = await getPublishedNews({ id });
      if (!data) {
        return NextResponse.json({ success: false, error: 'Article not found.' }, { status: 404, headers: noStoreHeaders });
      }
      return NextResponse.json({ success: true, data }, { headers: noStoreHeaders });
    }

    const data = await getPublishedNews({ limit });
    return NextResponse.json({ success: true, data }, { headers: noStoreHeaders });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch news.' },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
