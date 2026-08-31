import { sanitiseCommitteeCalendarIcs } from '@/lib/calendar/google-committee-ics';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const GOOGLE_COMMITTEE_CALENDAR_ID =
  '5dd8b075c21a66b0f00c52bfc27151d84271334e95d5d2346ed235ec05be1531@group.calendar.google.com';
const GOOGLE_PUBLIC_ICS_URL = `https://calendar.google.com/calendar/ical/${encodeURIComponent(GOOGLE_COMMITTEE_CALENDAR_ID)}/public/basic.ics`;

export async function GET(request: Request) {
  try {
    const upstream = await fetch(GOOGLE_PUBLIC_ICS_URL, {
      cache: 'no-store',
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
