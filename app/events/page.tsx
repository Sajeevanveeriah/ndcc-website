import type { Metadata } from 'next';
import Link from 'next/link';
import SafeImage from '@/components/common/SafeImage';
import ScrollReveal from '@/components/common/ScrollReveal';
import Card, { CardContent, CardFooter } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { formatDate, formatCurrency } from '@/lib/utils';
import { normalizeEventImage } from '@/lib/public-content-normalizers';
import { getPublicEvents } from '@/lib/public-data';

export const metadata: Metadata = {
  title: 'Events',
};

// Request-time rendering: events are mutable CMS content, so they must never
// be served from a build-time prerender or the ISR cache.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function EventsPage() {
  const { data: events } = await getPublicEvents();

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">Events</h1>
          <p className="page-hero-subtitle">
            Upcoming club events, match days, and social fixtures for the Newcomb &amp; District cricket community.
          </p>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          {events.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <h2 className="text-2xl font-display font-bold text-maroon-800 dark:text-maroon-200 mb-2">No published events</h2>
                <p className="text-content-muted font-body">Published club events, including Dino Lotto when marked published, will appear here as soon as they are available.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map((event) => {
                const imageUrl = normalizeEventImage(event.title, event.image_url);
                return (
                  <ScrollReveal key={event.id}>
                    <Card hover className="h-full flex flex-col">
                      {imageUrl && (
                        <div className="relative aspect-[4/3] w-full bg-surface-page">
                          <SafeImage
                            src={imageUrl}
                            alt={`${event.title} event artwork`}
                            fill
                            className="object-contain"
                            sizes="(max-width: 1024px) 100vw, 33vw"
                            fallback={<div className="absolute inset-0 bg-surface-page" aria-hidden="true" />}
                          />
                        </div>
                      )}
                      <div className="bg-gradient-to-br from-maroon-700 to-maroon-900 px-6 py-4">
                        <p className="text-gold-200 font-body text-xs font-semibold uppercase tracking-[0.08em]">{formatDate(event.date)}</p>
                        <h3 className="text-white font-display font-bold text-xl mt-1">{event.title}</h3>
                      </div>
                      <CardContent>
                        <div className="flex items-center gap-2 mb-3">
                          <svg className="w-4 h-4 text-maroon-600 dark:text-maroon-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                          </svg>
                          <span className="font-body text-sm text-content-muted">{event.location}</span>
                        </div>
                        <p className="font-body text-content-secondary text-sm leading-relaxed mb-4">
                          {event.description.length > 150
                            ? `${event.description.slice(0, 150).trim()}...`
                            : event.description}
                        </p>
                        <Badge variant={event.ticket_price === 0 ? 'success' : 'default'}>
                          {event.ticket_price === 0 ? 'Free Entry' : formatCurrency(event.ticket_price)}
                        </Badge>
                      </CardContent>
                      <CardFooter className="mt-auto">
                        <Link href={`/events/${event.id}`} className="btn-primary text-sm px-4 py-2">
                          View Details
                        </Link>
                      </CardFooter>
                    </Card>
                  </ScrollReveal>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
