import { unstable_cache } from 'next/cache';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { fallbackEvents, fallbackGalleryImages, fallbackSponsors, isProductionStaticBuild, mergeSponsorsWithFallback } from '@/lib/fallback-content';
import { normalizeEventImage, normalizeGalleryImage } from '@/lib/public-content-normalizers';
import type { Event, Sponsor } from '@/lib/types';

export type PublicDataSource = 'supabase' | 'fallback';

export type PublicDataResult<T> = {
  data: T;
  error: string | null;
  source: PublicDataSource;
  degraded: boolean;
};

export type GalleryPhoto = {
  id: string;
  image_url: string;
  alt_text: string;
  caption: string;
  title: string;
  allow_download: boolean;
  sort_order: number;
};

const getPublishedEventsFromSupabase = unstable_cache(async () => {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('published', true)
    .order('date', { ascending: true });
  return { data: data ?? [], error: error?.message ?? null };
}, ['public-events-data'], { revalidate: 300, tags: ['events'] });

const getPublishedGalleryFromSupabase = unstable_cache(async () => {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('gallery_images')
    .select('id,title,caption,image_url,alt_text,allow_download,sort_order')
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  return { data: data ?? [], error: error?.message ?? null };
}, ['public-gallery-data'], { revalidate: 300, tags: ['gallery'] });

const getActiveSponsorsFromSupabase = unstable_cache(async () => {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('sponsors')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: true });
  return { data: data ?? [], error: error?.message ?? null };
}, ['public-sponsors-data'], { revalidate: 300, tags: ['sponsors'] });

function fallbackResult<T>(data: T, error: string | null = null): PublicDataResult<T> {
  return { data, error, source: 'fallback', degraded: true };
}

export async function getPublicEvents(): Promise<PublicDataResult<Event[]>> {
  const fallback = fallbackEvents as Event[];
  if (isProductionStaticBuild || !isServerSupabaseConfigured()) return fallbackResult(fallback);

  try {
    const { data, error } = await getPublishedEventsFromSupabase();
    if (error) return fallbackResult(fallback, error);
    if (data.length === 0) return fallbackResult(fallback);
    return {
      data: (data as Event[]).map((event) => ({
        ...event,
        image_url: normalizeEventImage(event.title, event.image_url || null),
      })),
      error: null,
      source: 'supabase',
      degraded: false,
    };
  } catch (err) {
    return fallbackResult(fallback, err instanceof Error ? err.message : 'Failed to load events');
  }
}

export async function getPublicGallery(): Promise<PublicDataResult<GalleryPhoto[]>> {
  const fallback = fallbackGalleryImages as GalleryPhoto[];
  if (isProductionStaticBuild || !isServerSupabaseConfigured()) return fallbackResult(fallback);

  try {
    const { data, error } = await getPublishedGalleryFromSupabase();
    if (error) return fallbackResult(fallback, error);
    if (data.length === 0) return fallbackResult(fallback);
    return { data: data.map((item) => normalizeGalleryImage(item)) as GalleryPhoto[], error: null, source: 'supabase', degraded: false };
  } catch (err) {
    return fallbackResult(fallback, err instanceof Error ? err.message : 'Failed to load gallery');
  }
}

export async function getPublicSponsors(): Promise<PublicDataResult<Sponsor[]>> {
  const fallback = fallbackSponsors as Sponsor[];
  if (isProductionStaticBuild || !isServerSupabaseConfigured()) return fallbackResult(fallback);

  try {
    const { data, error } = await getActiveSponsorsFromSupabase();
    if (error) return fallbackResult(fallback, error);
    if (data.length === 0) return fallbackResult(fallback);
    return { data: mergeSponsorsWithFallback(data as Sponsor[]), error: null, source: 'supabase', degraded: false };
  } catch (err) {
    return fallbackResult(fallback, err instanceof Error ? err.message : 'Failed to load sponsors');
  }
}
