import { NextResponse } from 'next/server';
import { getPublicCalendarEvents, parseCalendarTypes } from '@/lib/calendar/queries';
import { toCalendarFeedEvent } from '@/lib/calendar/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

function jsonNoCache(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...NO_CACHE_HEADERS, ...(init?.headers || {}) },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : null;

  const result = await getPublicCalendarEvents({
    from: searchParams.get('from'),
    to: searchParams.get('to'),
    limit: Number.isInteger(limit) && limit !== null && limit > 0 ? limit : null,
    types: parseCalendarTypes(searchParams.get('type')),
    featured: searchParams.get('featured') === '1' || searchParams.get('featured') === 'true',
    home: searchParams.get('home') === '1' || searchParams.get('home') === 'true',
    contact: searchParams.get('contact') === '1' || searchParams.get('contact') === 'true',
  });

  if (result.degraded) {
    return jsonNoCache({ success: false, data: [], error: 'Calendar is temporarily unavailable.', degraded: true }, { status: 503 });
  }

  return jsonNoCache({
    success: true,
    data: result.data.map(toCalendarFeedEvent),
    degraded: false,
    error: null,
  });
}
