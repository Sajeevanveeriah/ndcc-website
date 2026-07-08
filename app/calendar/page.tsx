import type { Metadata } from 'next';
import Link from 'next/link';
import NdccCalendar from '@/components/calendar/NdccCalendar';
import UpcomingEventsStrip from '@/components/calendar/UpcomingEventsStrip';
import AddToCalendarButton from '@/components/calendar/AddToCalendarButton';
import { getPublicCalendarEvents, getUpcomingCalendarEvents } from '@/lib/calendar/queries';
import { toCalendarFeedEvent } from '@/lib/calendar/format';

export const metadata: Metadata = {
  title: 'Club Calendar',
  description:
    'The Newcomb and District Cricket Club calendar — matches, training, junior cricket, social nights and club events, all in one place.',
};

// Request-time rendering: calendar entries are mutable CMS content, so they
// must never be served from a build-time prerender or the ISR cache.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function CalendarPage() {
  // A wide window so month navigation works without refetching: 6 months back,
  // 18 months ahead.
  const now = Date.now();
  const from = new Date(now - 183 * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(now + 550 * 24 * 60 * 60 * 1000).toISOString();

  const [calendarResult, upcomingResult] = await Promise.all([
    getPublicCalendarEvents({ from, to }),
    getUpcomingCalendarEvents({ limit: 5 }),
  ]);

  const feedEvents = calendarResult.data.map(toCalendarFeedEvent);
  const upcomingEvents = upcomingResult.data.map(toCalendarFeedEvent);

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">Club Calendar</h1>
          <p className="page-hero-subtitle">
            Everything happening at the Dinos — matches, training, junior cricket, social nights and club events.
            All times are Melbourne time.
          </p>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          {calendarResult.degraded ? (
            <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
              <h2 className="text-xl font-display font-bold text-maroon-800 mb-2">Calendar temporarily unavailable</h2>
              <p className="text-gray-600 font-body text-sm">
                We couldn&apos;t load the club calendar just now. Please refresh the page or try again shortly.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start">
              <div>
                <NdccCalendar events={feedEvents} />
              </div>
              <aside className="space-y-6">
                <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-soft">
                  <UpcomingEventsStrip
                    events={upcomingEvents}
                    heading="Coming up"
                    compact
                    showViewAll={false}
                    emptyMessage="No upcoming events are published right now — check back soon."
                  />
                </div>
                <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-soft space-y-3">
                  <h3 className="font-display font-bold uppercase tracking-wide text-maroon-800 text-lg">
                    Take the calendar with you
                  </h3>
                  <p className="text-sm font-body text-gray-600">
                    Import published club events into Google, Apple or Outlook calendars.
                  </p>
                  <AddToCalendarButton />
                </div>
                <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-soft">
                  <h3 className="font-display font-bold uppercase tracking-wide text-maroon-800 text-lg mb-2">
                    Spotted a problem?
                  </h3>
                  <p className="text-sm font-body text-gray-600">
                    If an event time or detail looks wrong,{' '}
                    <Link href="/contact" className="text-maroon-700 font-semibold hover:text-maroon-500">
                      let the club know
                    </Link>{' '}
                    and we&apos;ll fix it.
                  </p>
                </div>
              </aside>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
