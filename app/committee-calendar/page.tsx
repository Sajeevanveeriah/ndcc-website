import type { Metadata } from 'next';
import Link from 'next/link';
import CommitteeCalendarSubscribe from '@/components/calendar/CommitteeCalendarSubscribe';
import { requireSession } from '@/lib/auth/guard';
import { CLUB_ADMIN_ROLES } from '@/lib/auth/config';
import { committeeFeedKey } from '@/lib/calendar/committee-feed-key';

// Committee surface: always rendered per request, never from the ISR cache.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Committee Calendar',
  description: 'Subscribe to the Newcomb and District Cricket Club committee calendar.',
  robots: { index: false, follow: false },
};

export default async function CommitteeCalendarPage() {
  // Private bookings and meetings are only in the keyed feed, which is shown to
  // signed-in committee members. Everyone else gets the public club events.
  const member = await requireSession(CLUB_ADMIN_ROLES).catch(() => null);
  const feedKey = member ? committeeFeedKey() : null;

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">NDCC Committee Calendar</h1>
          <p className="page-hero-subtitle">
            One subscription for committee events, meetings, bookings and important club dates. Subscribe once and future
            changes update automatically.
          </p>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width max-w-3xl">
          {feedKey ? (
            <p className="mb-4 rounded-xl border border-edge-subtle bg-surface-card p-4 font-body text-sm text-content-secondary">
              You are signed in, so this is the full committee calendar, including private bookings and meetings. Keep this
              link within the committee. If you subscribed before 7 October 2026, subscribe again here to keep seeing private
              bookings.
            </p>
          ) : (
            <p className="mb-4 rounded-xl border border-edge-subtle bg-surface-card p-4 font-body text-sm text-content-secondary">
              This link shows the club&apos;s public events. Committee members:{' '}
              <Link href="/admin/login" className="text-maroon-700 underline dark:text-maroon-200">sign in</Link>, then open this
              page again for the full calendar with private bookings and meetings.
            </p>
          )}
          <CommitteeCalendarSubscribe feedKey={feedKey} />

          <div className="mt-6 rounded-xl border border-edge-subtle bg-surface-card p-5 shadow-soft sm:p-6">
            <h2 className="font-display text-xl font-bold text-content-primary">What is shared</h2>
            <p className="mt-2 font-body text-content-secondary">
              The subscription includes the committee event name, date, time and location. Private descriptions, attendee
              addresses, organiser details, links and internal notes are removed before the calendar reaches this page.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
