import { NextResponse } from 'next/server';
import { getPublicEvents } from '@/lib/public-data';

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
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const result = await getPublicEvents();

  if (id) {
    const event = result.data.find((item) => item.id === id);
    if (!event) return jsonNoCache({ success: false, error: 'Event not found.' }, { status: 404 });
    return jsonNoCache({ success: true, data: event, source: result.source, degraded: result.degraded, error: result.error });
  }

  return jsonNoCache({ success: true, data: result.data, source: result.source, degraded: result.degraded, error: result.error });
}
