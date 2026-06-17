import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase-server';
import { normalizeEventImage } from '@/lib/public-content-normalizers';
import { formatDateTime, truncateText } from '@/lib/utils';
import type { Event } from '@/lib/types';
import EventDetailClient from './EventDetailClient';

export const revalidate = 300;

const getEvent = unstable_cache(async (id: string): Promise<Event | null> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .eq('published', true)
      .maybeSingle();
    if (error || !data) return null;
    return data as Event;
  } catch {
    return null;
  }
}, ['event-detail'], { revalidate: 300, tags: ['events'] });

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const event = await getEvent(params.id);
  if (!event) {
    return { title: 'Event Not Found' };
  }
  const description = truncateText(event.description || `${event.title} — ${formatDateTime(event.date)}`, 160);
  const image = normalizeEventImage(event.title, event.image_url);
  return {
    title: event.title,
    description,
    openGraph: {
      title: event.title,
      description,
      images: image ? [{ url: image, alt: event.title }] : [{ url: '/images/logo.jpg', alt: 'NDCC Logo' }],
    },
  };
}

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const event = await getEvent(params.id);
  if (!event) {
    notFound();
  }

  const image = normalizeEventImage(event.title, event.image_url);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    ...(event.description ? { description: truncateText(event.description, 200) } : {}),
    startDate: event.date,
    ...(event.location ? { location: { '@type': 'Place', name: event.location } } : {}),
    ...(image ? { image: [image] } : {}),
    organizer: {
      '@type': 'Organization',
      name: 'Newcomb and District Cricket Club',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <EventDetailClient event={event} />
    </>
  );
}
