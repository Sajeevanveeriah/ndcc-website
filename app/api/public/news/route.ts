import { NextResponse } from 'next/server';
import { getPublishedNews } from '@/lib/public-news';
import { SEED_NEWS } from '@/lib/constants';
import { isPublicNewsPostAllowed, normalizeNewsImage } from '@/lib/public-content-normalizers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;


function getSeedNews(id?: string, limit?: number) {
  const posts = SEED_NEWS
    .filter((post) => post.published && isPublicNewsPostAllowed(post.title))
    .map((post) => ({
      ...post,
      created_at: post.published_at || new Date(0).toISOString(),
      image_url: normalizeNewsImage(post.title, post.image_url || post.image || null),
    }))
    .sort((a, b) => {
      const sortA = typeof a.sort_order === 'number' ? a.sort_order : Number.MAX_SAFE_INTEGER;
      const sortB = typeof b.sort_order === 'number' ? b.sort_order : Number.MAX_SAFE_INTEGER;
      if (sortA !== sortB) return sortA - sortB;
      return new Date(b.published_at || b.created_at).getTime() - new Date(a.published_at || a.created_at).getTime();
    });

  if (id) return posts.find((post) => post.id === id) ?? null;
  return typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? posts.slice(0, limit) : posts;
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
    return NextResponse.json({ success: true, data }, { headers: noStoreHeaders });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch news.' },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
