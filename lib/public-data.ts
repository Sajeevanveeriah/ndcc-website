import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { fallbackEvents, fallbackGalleryImages, fallbackSponsors, mergeSponsorsWithFallback } from '@/lib/fallback-content';
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

const PUBLIC_QUERY_TIMEOUT_MS = 5_000;

// Uncached live reads. These helpers back mutable public CMS content, so they
// must hit Supabase on every request — wrapping them in unstable_cache let
// build-time fallback output persist in the Data Cache and alternate with live
// rows in production.
async function getPublishedEventsFromSupabase() {
  const supabase = createServerClient({ fetchTimeoutMs: PUBLIC_QUERY_TIMEOUT_MS });
  const { data, error } = await supabase
    .from('events')
    .select('id,title,description,date,location,capacity,ticket_price,stripe_link,published,image_url')
    .eq('published', true)
    .order('date', { ascending: true });
  return { data: data ?? [], error: error?.message ?? null };
}

async function getPublishedGalleryFromSupabase() {
  const supabase = createServerClient({ fetchTimeoutMs: PUBLIC_QUERY_TIMEOUT_MS });
  const { data, error } = await supabase
    .from('gallery_images')
    .select('id,title,caption,image_url,alt_text,allow_download,sort_order')
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  return { data: data ?? [], error: error?.message ?? null };
}

async function getActiveSponsorsFromSupabase() {
  const supabase = createServerClient({ fetchTimeoutMs: PUBLIC_QUERY_TIMEOUT_MS });
  const { data, error } = await supabase
    .from('sponsors')
    .select('id,name,tier,logo_url,website,placement_type,active,created_at,description,sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  return { data: data ?? [], error: error?.message ?? null };
}

function fallbackResult<T>(data: T, error: string | null = null): PublicDataResult<T> {
  // A non-null error means the live query failed (not a genuine empty
  // result), so record it — otherwise a Supabase outage is invisible in logs.
  if (error) console.error('[public-data] Live query failed; serving static fallback content:', error);
  return { data, error, source: 'fallback', degraded: true };
}

export async function getPublicEvents(): Promise<PublicDataResult<Event[]>> {
  const fallback = fallbackEvents as Event[];
  if (!isServerSupabaseConfigured()) return fallbackResult(fallback);

  try {
    const { data, error } = await getPublishedEventsFromSupabase();
    if (error) return fallbackResult(fallback, error);
    // A successful empty result is live truth (e.g. every event unpublished) — the
    // page renders its empty state rather than resurrecting stale seed content.
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
  if (!isServerSupabaseConfigured()) return fallbackResult(fallback);

  try {
    const { data, error } = await getPublishedGalleryFromSupabase();
    if (error) return fallbackResult(fallback, error);
    return { data: data.map((item) => normalizeGalleryImage(item)) as GalleryPhoto[], error: null, source: 'supabase', degraded: false };
  } catch (err) {
    return fallbackResult(fallback, err instanceof Error ? err.message : 'Failed to load gallery');
  }
}

export async function getPublicSponsors(): Promise<PublicDataResult<Sponsor[]>> {
  const fallback = fallbackSponsors as Sponsor[];
  if (!isServerSupabaseConfigured()) return fallbackResult(fallback);

  try {
    const { data, error } = await getActiveSponsorsFromSupabase();
    if (error) return fallbackResult(fallback, error);
    if (data.length === 0) return { data: [], error: null, source: 'supabase' as const, degraded: false };
    return { data: mergeSponsorsWithFallback(data as Sponsor[]), error: null, source: 'supabase', degraded: false };
  } catch (err) {
    return fallbackResult(fallback, err instanceof Error ? err.message : 'Failed to load sponsors');
  }
}
