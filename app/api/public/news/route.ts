import { NextResponse } from 'next/server';
import { getPublishedNews } from '@/lib/public-news';
import { fallbackNews } from '@/lib/fallback-content';

export const dynamic = 'force-dynamic';
export const revalidate = 0;


function getSeedNews(id?: string, limit?: number) {
  if (id) return fallbackNews.find((post) => post.id === id) ?? null;
  return typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? fallbackNews.slice(0, limit) : fallbackNews;
}

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const limitParam = searchParams.get('limit');
  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
  const limit = Number.isFinite(parsedLimit) && parsedLimit && parsedLimit > 0 ? parsedLimit : undefined;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const data = getSeedNews(id ?? undefined, limit);
    if (id && !data) {
      return NextResponse.json({ success: false, error: 'Article not found.' }, { status: 404, headers: noStoreHeaders });
    }
    return NextResponse.json({ success: true, data }, { headers: noStoreHeaders });
  }

  try {
    if (id) {
      const data = await getPublishedNews({ id });
      if (!data) {
        return NextResponse.json({ success: false, error: 'Article not found.' }, { status: 404, headers: noStoreHeaders });
      }
      return NextResponse.json({ success: true, data }, { headers: noStoreHeaders });
    }

    const data = await getPublishedNews({ limit });
    const posts = Array.isArray(data) && data.length > 0 ? data : getSeedNews(undefined, limit);
    return NextResponse.json({ success: true, data: posts }, { headers: noStoreHeaders });
  } catch {
    return NextResponse.json({ success: true, data: getSeedNews(undefined, limit) }, { headers: noStoreHeaders });
  }
}
