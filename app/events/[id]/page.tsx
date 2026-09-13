import { cache } from 'react';
import { pageMetadata, absoluteUrl, ORGANIZATION_ID, breadcrumbJsonLd } from '@/lib/seo';
import { eventVenue } from '@/lib/event-venue';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serializeJsonLd } from '@/lib/json-ld';
import { createServerClient } from '@/lib/supabase-server';
import { normalizeEventImage } from '@/lib/public-content-normalizers';
import { formatDateTime, truncateText } from '@/lib/utils';
import type { Event } from '@/lib/types';
import EventDetailClient from './EventDetailClient';

// Request-time rendering: events are mutable CMS content.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const getEvent = cache(async (id: string): Promise<Event | null> => {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null;
  const { data, error } = await createServerClient().from('events').select('*')
    .eq('id', id).eq('published', true).maybeSingle();
  if (error) throw new Error('Event temporarily unavailable');
  return data as Event | null;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) {
    notFound();
  }
  const description = truncateText(event.description || `${event.title} - ${formatDateTime(event.date)}`, 160);
  const image = normalizeEventImage(event.title, event.image_url);
  return pageMetadata(`/events/${event.id}`, event.title, description, image || undefined);
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) {
    notFound();
  }

  const image = normalizeEventImage(event.title, event.image_url);
  const venue = eventVenue(event.location);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    '@id': `${absoluteUrl(`/events/${event.id}`)}#event`,
    url: absoluteUrl(`/events/${event.id}`),
    name: event.title,
    ...(event.description ? { description: truncateText(event.description, 200) } : {}),
    startDate: event.date,
    ...(venue.name ? { location: { '@type': 'Place', ...venue } } : {}),
    ...(image ? { image: [absoluteUrl(image)] } : {}),
    organizer: {
      '@type': 'Organization',
      '@id': ORGANIZATION_ID,
      name: 'Newcomb and District Cricket Club',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd([jsonLd, breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Events', path: '/events' }, { name: event.title, path: `/events/${event.id}` }])]) }}
      />
      <EventDetailClient event={event} />
    </>
  );
}
