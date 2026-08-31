import type { Metadata } from 'next';
import CommitteeCalendarSubscribe from '@/components/calendar/CommitteeCalendarSubscribe';

export const metadata: Metadata = {
  title: 'Committee Calendar',
  description: 'Subscribe to the Newcomb and District Cricket Club committee calendar.',
  robots: { index: false, follow: false },
};

export default function CommitteeCalendarPage() {
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
          <CommitteeCalendarSubscribe />

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
