import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

function jsonNoCache(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_CACHE_HEADERS,
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
    return jsonNoCache({ success: false, error: 'Service not configured.' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id) {
    const { data, error } = await getPublishedEvent(id);

    if (error) return jsonNoCache({ success: false, error }, { status: 500 });
    if (!data) return jsonNoCache({ success: false, error: 'Event not found.' }, { status: 404 });
    return jsonNoCache({ success: true, data });
  }

  const { data, error } = await getPublishedEvents();

  if (error) return jsonNoCache({ success: false, error }, { status: 500 });
  return jsonNoCache({ success: true, data });
}
