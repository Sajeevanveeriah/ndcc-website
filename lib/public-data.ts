import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { fallbackEvents, fallbackGalleryImages, fallbackSponsors, mergeSponsorsWithFallback } from '@/lib/fallback-content';
import { normalizeEventImage, normalizeGalleryImage } from '@/lib/public-content-normalizers';
import type { Event, Sponsor } from '@/lib/types';
import { sortSponsorsAlphabetically } from '@/lib/sponsor-presentation';

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
  // Optional Storage-backed fields (present after the gallery-albums
  // migration; legacy rows leave them null/undefined).
  original_url?: string | null;
  original_filename?: string | null;
  mime_type?: string | null;
  width?: number | null;
  height?: number | null;
};

export type GalleryAlbum = {
  id: string;
  title: string;
  slug: string;
  description: string;
  event_date: string | null;
  season_label: string;
  cover_image_url: string | null;
  sort_order: number;
  allow_download: boolean;
  published: boolean;
  image_count: number;
};

// See lib/calendar/queries.ts: the production database work is fast, but a
// cold PostgREST connection has exceeded the previous five-second budget.
const PUBLIC_QUERY_TIMEOUT_MS = 15_000;

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

// The album-aware queries reference columns added by the gallery-albums
// migration. Until that migration is applied, they fail with a
// missing-column/table error and the caller falls back to the legacy flat
// query, so existing deployments keep working without manual conversion.
function isMissingGallerySchemaError(message: string | null) {
  return Boolean(message && /album_id|gallery_albums|schema cache/i.test(message));
}

async function getPublishedGalleryFromSupabase() {
  const supabase = createServerClient({ fetchTimeoutMs: PUBLIC_QUERY_TIMEOUT_MS });
  // Ungrouped (album_id IS NULL) published images: the legacy flat gallery.
  const { data, error } = await supabase
    .from('gallery_images')
    .select('id,title,caption,image_url,alt_text,allow_download,sort_order')
    .eq('published', true)
    .is('album_id', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error && isMissingGallerySchemaError(error.message)) {
    const legacy = await supabase
      .from('gallery_images')
      .select('id,title,caption,image_url,alt_text,allow_download,sort_order')
      .eq('published', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    return { data: legacy.data ?? [], error: legacy.error?.message ?? null };
  }
  return { data: data ?? [], error: error?.message ?? null };
}

async function getActiveSponsorsFromSupabase() {
  const supabase = createServerClient({ fetchTimeoutMs: PUBLIC_QUERY_TIMEOUT_MS });
  const { data, error } = await supabase
    .from('sponsors')
    .select('id,name,tier,logo_url,website,placement_type,active,created_at,description,sort_order,logo_surface_mode,logo_padding,logo_object_position')
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

/**
 * Published gallery albums with their published-image counts, for the public
 * /gallery album cards. Returns an empty list (not fallback content) when the
 * album schema is not yet available, so pre-migration deployments render the
 * legacy flat gallery unchanged.
 */
export async function getPublicGalleryAlbums(): Promise<PublicDataResult<GalleryAlbum[]>> {
  if (!isServerSupabaseConfigured()) return { data: [], error: null, source: 'fallback', degraded: true };
  try {
    const supabase = createServerClient({ fetchTimeoutMs: PUBLIC_QUERY_TIMEOUT_MS });
    const [{ data: albums, error }, { data: imageRows, error: imagesError }] = await Promise.all([
      supabase
        .from('gallery_albums')
        .select('id,title,slug,description,event_date,season_label,cover_image_url,sort_order,allow_download,published')
        .eq('published', true)
        .order('sort_order', { ascending: true })
        .order('event_date', { ascending: false }),
      supabase
        .from('gallery_images')
        .select('album_id,image_url')
        .eq('published', true)
        .not('album_id', 'is', null),
    ]);
    if (error) {
      if (isMissingGallerySchemaError(error.message)) return { data: [], error: null, source: 'supabase', degraded: false };
      return { data: [], error: error.message, source: 'fallback', degraded: true };
    }
    if (imagesError) return { data: [], error: imagesError.message, source: 'fallback', degraded: true };

    const counts = new Map<string, number>();
    const firstImage = new Map<string, string>();
    for (const row of imageRows ?? []) {
      if (!row.album_id) continue;
      counts.set(row.album_id, (counts.get(row.album_id) ?? 0) + 1);
      if (!firstImage.has(row.album_id) && row.image_url) firstImage.set(row.album_id, row.image_url);
    }
    const data = (albums ?? []).map((album) => ({
      ...album,
      cover_image_url: album.cover_image_url || firstImage.get(album.id) || null,
      image_count: counts.get(album.id) ?? 0,
    })) as GalleryAlbum[];
    return { data, error: null, source: 'supabase', degraded: false };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : 'Failed to load gallery albums', source: 'fallback', degraded: true };
  }
}

export type PublicAlbumDetail = {
  album: Omit<GalleryAlbum, 'image_count'>;
  photos: GalleryPhoto[];
};

/** One published album by slug with its published images, or null. */
export async function getPublicAlbumBySlug(slug: string): Promise<PublicAlbumDetail | null> {
  if (!isServerSupabaseConfigured()) return null;
  try {
    const supabase = createServerClient({ fetchTimeoutMs: PUBLIC_QUERY_TIMEOUT_MS });
    const { data: album, error } = await supabase
      .from('gallery_albums')
      .select('id,title,slug,description,event_date,season_label,cover_image_url,sort_order,allow_download,published')
      .eq('published', true)
      .eq('slug', slug)
      .maybeSingle();
    if (error || !album) return null;

    const { data: photos, error: photosError } = await supabase
      .from('gallery_images')
      .select('id,title,caption,image_url,alt_text,allow_download,sort_order,original_url,original_filename,mime_type,width,height')
      .eq('published', true)
      .eq('album_id', album.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (photosError) return { album, photos: [] };
    return { album, photos: (photos ?? []) as GalleryPhoto[] };
  } catch {
    return null;
  }
}

export async function getPublicSponsors(): Promise<PublicDataResult<Sponsor[]>> {
  const fallback = sortSponsorsAlphabetically(fallbackSponsors as Sponsor[]);
  if (!isServerSupabaseConfigured()) return fallbackResult(fallback);

  try {
    const { data, error } = await getActiveSponsorsFromSupabase();
    if (error) return fallbackResult(fallback, error);
    if (data.length === 0) return { data: [], error: null, source: 'supabase' as const, degraded: false };
    return { data: sortSponsorsAlphabetically(mergeSponsorsWithFallback(data as Sponsor[])), error: null, source: 'supabase', degraded: false };
  } catch (err) {
    return fallbackResult(fallback, err instanceof Error ? err.message : 'Failed to load sponsors');
  }
}
