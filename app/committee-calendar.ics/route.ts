import { sanitiseCommitteeCalendarIcs } from '@/lib/calendar/google-committee-ics';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const FEED_KEY = 'committee';

function validateGooglePrivateIcsUrl(value: string): string {
  const parsed = new URL(value);
  const isGoogleCalendar = parsed.protocol === 'https:' && parsed.hostname === 'calendar.google.com';
  const looksLikePrivateIcs = parsed.pathname.includes('/private-') && parsed.pathname.endsWith('/basic.ics');

  if (!isGoogleCalendar || !looksLikePrivateIcs) {
    throw new Error('Committee calendar source is not a valid Google private iCal address.');
  }

  return parsed.toString();
}

async function getCommitteeCalendarSourceUrl(): Promise<string> {
  const supabase = createServerClient({ fetchTimeoutMs: 5000 });
  const { data, error } = await supabase
    .from('calendar_private_feeds')
    .select('source_url')
    .eq('feed_key', FEED_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(`Committee calendar source lookup failed: ${error.code || 'unknown'}.`);
  }
  if (!data?.source_url) {
    throw new Error('Committee calendar source is not configured.');
  }

  return validateGooglePrivateIcsUrl(data.source_url);
}

export async function GET(request: Request) {
  try {
    const sourceUrl = await getCommitteeCalendarSourceUrl();
    const upstream = await fetch(sourceUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1' },
    });

    if (!upstream.ok) {
      throw new Error(`Google Calendar returned HTTP ${upstream.status}.`);
    }

    const source = await upstream.text();
    const body = sanitiseCommitteeCalendarIcs(source);
    const download = new URL(request.url).searchParams.get('download') === '1';

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
        'X-Robots-Tag': 'noindex, nofollow',
        ...(download
          ? { 'Content-Disposition': 'attachment; filename="NDCC-Committee-Calendar.ics"' }
          : {}),
      },
    });
  } catch (error) {
    console.error(
      '[committee-calendar] Unable to produce the subscription feed:',
      error instanceof Error ? error.message : 'Unknown error',
    );

    return new Response('NDCC Committee Calendar is temporarily unavailable.', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }
}
