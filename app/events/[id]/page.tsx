import { cache } from 'react';
import { pageMetadata, absoluteUrl, ORGANIZATION_ID, breadcrumbJsonLd } from '@/lib/seo';
import { eventVenue } from '@/lib/event-venue';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { draftMode } from 'next/headers';
import { serializeJsonLd } from '@/lib/json-ld';
import { createServerClient } from '@/lib/supabase-server';
import { normalizeEventImage } from '@/lib/public-content-normalizers';
import { formatDateTime, truncateText } from '@/lib/utils';
import type { Event } from '@/lib/types';
import { isMissingPublishedAtColumn, scheduledVisibilityFilter } from '@/lib/public-data';
import { canRenderRecord, previewBannerLabel } from '@/lib/preview';
import PreviewBanner from '@/components/common/PreviewBanner';
import EventDetailClient from './EventDetailClient';

// ISR: regenerated at most every 60s and on demand after admin writes
// (lib/server/revalidate-public.ts). 'force-static' lets the Supabase reads,
// which use cache: 'no-store' fetches, run during static regeneration instead
// of opting the route into per-request rendering. This route reads no
// cookies, headers or searchParams. Draft mode (committee preview, enabled
// only by /api/admin/preview) renders per request and may show unpublished
// or scheduled events with a preview banner.
export const dynamic = 'force-static';
export const revalidate = 60;

type DetailEvent = Event & { published_at?: string | null };

const getEvent = cache(async (id: string, preview: boolean): Promise<DetailEvent | null> => {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null;
  const client = createServerClient({ retryReads: true });
  if (preview) {
    const { data, error } = await client.from('events').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error('Event temporarily unavailable');
    return canRenderRecord(data as DetailEvent | null, true) ? data as DetailEvent : null;
  }
  const query = (scheduled: boolean) => {
    const base = client.from('events').select('*').eq('id', id).eq('published', true);
    return (scheduled ? base.or(scheduledVisibilityFilter()) : base).maybeSingle();
  };
  let { data, error } = await query(true);
  if (isMissingPublishedAtColumn(error)) ({ data, error } = await query(false));
  if (error) throw new Error('Event temporarily unavailable');
  return data as DetailEvent | null;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const preview = (await draftMode()).isEnabled;
  const event = await getEvent(id, preview);
  if (!event) {
    notFound();
  }
  const description = truncateText(event.description || `${event.title} - ${formatDateTime(event.date)}`, 160);
  const image = normalizeEventImage(event.title, event.image_url);
  const metadata = pageMetadata(`/events/${event.id}`, event.title, description, image || undefined);
  return preview ? { ...metadata, robots: { index: false, follow: false } } : metadata;
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const preview = (await draftMode()).isEnabled;
  const event = await getEvent(id, preview);
  if (!event) {
    notFound();
  }
  const bannerLabel = previewBannerLabel(event, preview);

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
      {bannerLabel && <PreviewBanner label={bannerLabel} returnPath={`/events/${event.id}`} />}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd([jsonLd, breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Events', path: '/events' }, { name: event.title, path: `/events/${event.id}` }])]) }}
      />
      <EventDetailClient event={event} />
    </>
  );
}
