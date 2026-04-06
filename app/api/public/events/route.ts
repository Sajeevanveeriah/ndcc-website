import { NextResponse } from 'next/server';
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

export async function GET(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoCache({ success: false, error: 'Service not configured.' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const supabase = createServerClient();

  if (id) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .eq('published', true)
      .maybeSingle();

    if (error) return jsonNoCache({ success: false, error: error.message }, { status: 500 });
    if (!data) return jsonNoCache({ success: false, error: 'Event not found.' }, { status: 404 });
    return jsonNoCache({ success: true, data });
  }

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('published', true)
    .order('date', { ascending: true });

  if (error) return jsonNoCache({ success: false, error: error.message }, { status: 500 });
  return jsonNoCache({ success: true, data: data ?? [] });
}
