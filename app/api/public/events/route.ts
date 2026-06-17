import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';

export const revalidate = 300;
export const preferredRegion = 'syd1';

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
};

function jsonCached(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...CACHE_HEADERS,
      ...(init?.headers || {}),
    },
  });
}

const getPublishedEvent = unstable_cache(async (id: string) => {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .eq('published', true)
    .maybeSingle();
  return { data, error: error?.message ?? null };
}, ['public-events-by-id'], { revalidate: 300, tags: ['events'] });

const getPublishedEvents = unstable_cache(async () => {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('published', true)
    .order('date', { ascending: true });
  return { data: data ?? [], error: error?.message ?? null };
}, ['public-events'], { revalidate: 300, tags: ['events'] });

export async function GET(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonCached({ success: false, error: 'Service not configured.' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id) {
    const { data, error } = await getPublishedEvent(id);

    if (error) return jsonCached({ success: false, error }, { status: 500 });
    if (!data) return jsonCached({ success: false, error: 'Event not found.' }, { status: 404 });
    return jsonCached({ success: true, data });
  }

  const { data, error } = await getPublishedEvents();

  if (error) return jsonCached({ success: false, error }, { status: 500 });
  return jsonCached({ success: true, data });
}
