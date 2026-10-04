import { pageMetadata } from '@/lib/seo';
import { isSongRequestEvent } from '@/lib/events/song-requests';
import type { Metadata } from 'next';
import Link from 'next/link';
import SafeImage from '@/components/common/SafeImage';
import ScrollReveal from '@/components/common/ScrollReveal';
import { formatDate, formatCurrency } from '@/lib/utils';
import { normalizeEventImage } from '@/lib/public-content-normalizers';
import { getPublicEvents } from '@/lib/public-data';

export const metadata: Metadata = pageMetadata("/events", "Club and community events", "Explore upcoming NDCC events, including social nights and community gatherings. Check each event for its date, venue and booking details.");

// ISR: regenerated at most every 60s and on demand after admin writes
// (lib/server/revalidate-public.ts). 'force-static' lets the Supabase reads,
// which use cache: 'no-store' fetches, run during static regeneration instead
// of opting the route into per-request rendering. This route reads no
// cookies, headers or searchParams.
export const dynamic = 'force-static';
export const revalidate = 60;

const CLUB_TIME_ZONE = 'Australia/Melbourne';
const monthFormat = new Intl.DateTimeFormat('en-AU', { timeZone: CLUB_TIME_ZONE, month: 'long', year: 'numeric' });
const dayFormat = new Intl.DateTimeFormat('en-AU', { timeZone: CLUB_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en-AU', { timeZone: CLUB_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true });

/** Groups events (already sorted by date) under their club-time month, keeping order. */
function groupByMonth<T extends { date: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const label = monthFormat.format(new Date(item.date));
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups.entries()];
}

export default async function EventsPage() {
  const { data: allEvents, degraded } = await getPublicEvents();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date());
  const eventDay = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date(value));
  const events = allEvents.filter((event) => Number.isFinite(Date.parse(event.date)) && eventDay(event.date) >= today);
  const pastEvents = allEvents.filter((event) => Number.isFinite(Date.parse(event.date)) && eventDay(event.date) < today).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const months = groupByMonth(events);

  return (
    <>
      <section className="page-hero px-0 sm:px-0 lg:px-0">
        <div className="nd-wrap">
          <nav aria-label="Breadcrumb" className="nd-crumbs">
            <Link href="/">Home</Link> / <span aria-current="page">Events</span>
          </nav>
          <h1 className="page-hero-title">Events</h1>
          <p className="page-hero-subtitle">
            Upcoming club events, match days, and social fixtures for the Newcomb &amp; District cricket community.
          </p>
        </div>
      </section>

      <section className="nd-sec-tight">
        <div className="nd-wrap">
          {events.length === 0 ? (
            <div className="nd-card p-8 text-center">
              <h2 className="nd-h2 mb-2">{degraded ? 'Events are temporarily unavailable' : 'No upcoming events published'}</h2>
              <p className="text-content-muted font-body">Please check back for the next club event, or contact us for details.</p>
            </div>
          ) : (
            months.map(([month, monthEvents], index) => {
              const headingId = `events-month-${index}`;
              return (
                <section key={month} aria-labelledby={headingId} className="mt-9 first:mt-0">
                  <h2 id={headingId} className="nd-month">{month}</h2>
                  <ScrollReveal stagger className="nd-ev-grid">
                    {monthEvents.map((event) => {
                      const imageUrl = normalizeEventImage(event.title, event.image_url);
                      const songEvent = isSongRequestEvent(event);
                      const date = new Date(event.date);
                      return (
                        <article key={event.id} className="nd-card nd-ev-card">
                          {imageUrl && (
                            <div className="nd-ev-img">
                              <div className="relative h-full w-full">
                                <SafeImage
                                  src={imageUrl}
                                  alt={`${event.title} event artwork`}
                                  fill
                                  className="object-contain h-full! w-full!"
                                  sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 380px"
                                  fallback={<div className="absolute inset-0 bg-surface-muted" aria-hidden="true" />}
                                />
                              </div>
                            </div>
                          )}
                          <div className="nd-ev-body">
                            <span className={`nd-pill self-start${event.ticket_price === 0 ? '' : ' nd-pill-gold'}`}>
                              {event.ticket_price === 0 ? 'Free entry' : `${formatCurrency(event.ticket_price)}${songEvent ? ' per song' : ''}`}
                            </span>
                            <h3>{event.title}</h3>
                            <p className="nd-ev-meta">
                              <time dateTime={event.date}>{dayFormat.format(date)} · {timeFormat.format(date)}</time>
                              {event.location && <> · {event.location}</>}
                            </p>
                            {event.description && (
                              <p className="font-body text-[14.5px] leading-relaxed text-content-secondary">
                                {event.description.length > 150
                                  ? `${event.description.slice(0, 150).trim()}...`
                                  : event.description}
                              </p>
                            )}
                            <Link
                              href={`/events/${event.id}`}
                              className={songEvent ? 'btn-primary mt-auto self-start text-sm px-4 py-2' : 'nd-link mt-auto self-start'}
                            >
                              View details<span className="sr-only">: {event.title}</span>
                              {!songEvent && <span aria-hidden="true">→</span>}
                            </Link>
                          </div>
                        </article>
                      );
                    })}
                  </ScrollReveal>
                </section>
              );
            })
          )}
          {pastEvents.length > 0 && <section className="mt-12" aria-labelledby="past-events-title">
            <h2 id="past-events-title" className="nd-month mt-0">Past events</h2>
            <ul className="nd-card divide-y divide-edge-subtle px-5 sm:px-6">{pastEvents.map((event) => <li key={event.id} className="py-4"><Link href={`/events/${event.id}`} className="flex flex-wrap justify-between gap-2 font-semibold text-content-primary hover:underline underline-offset-[3px]">{event.title}<span className="text-sm font-normal text-content-muted">{formatDate(event.date)}</span></Link></li>)}</ul>
          </section>}
        </div>
      </section>
    </>
  );
}
