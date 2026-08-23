import { MetadataRoute } from 'next';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { isRafflePublic } from '@/lib/raffle-visibility';

async function getPublishedDetailEntries(baseUrl: string): Promise<MetadataRoute.Sitemap> {
  // Detail pages only exist for published CMS rows; skip silently when
  // Supabase is unconfigured or unreachable so the static sitemap still serves.
  if (!isServerSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient({ fetchTimeoutMs: 5_000 });
    const [news, events, publications] = await Promise.all([
      supabase.from('news').select('id,published_at,created_at').eq('published', true),
      supabase.from('events').select('id,date').eq('published', true),
      supabase.from('publications').select('slug,published_at,updated_at,created_at').eq('published', true),
    ]);
    const newsEntries: MetadataRoute.Sitemap = (news.data ?? []).map((row) => ({
      url: `${baseUrl}/news/${row.id}`,
      lastModified: new Date(row.published_at || row.created_at || Date.now()),
      changeFrequency: 'monthly',
      priority: 0.6,
    }));
    const eventEntries: MetadataRoute.Sitemap = (events.data ?? []).map((row) => ({
      url: `${baseUrl}/events/${row.id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    }));
    const publicationEntries: MetadataRoute.Sitemap = (publications.data ?? []).map((row) => ({
      url: `${baseUrl}/publications/${row.slug}`,
      lastModified: new Date(row.updated_at || row.published_at || row.created_at || Date.now()),
      changeFrequency: 'monthly',
      priority: 0.6,
    }));
    return [...newsEntries, ...eventEntries, ...publicationEntries];
  } catch (err) {
    console.error('[sitemap] Failed to load published detail routes:', err);
    return [];
  }
}

async function isDinoCoachPublic(): Promise<boolean> {
  if (!isServerSupabaseConfigured()) return false;
  try {
    const supabase = createServerClient({ fetchTimeoutMs: 5_000 });
    const { data: season } = await supabase.from('fantasy_seasons').select('id').eq('is_current', true).limit(1).maybeSingle();
    if (!season?.id) return false;
    const { data: settings } = await supabase.from('fantasy_dino_settings').select('public_launch_enabled').eq('season_id', season.id).maybeSingle();
    return settings?.public_launch_enabled === true;
  } catch {
    return false;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.ndcc.com.au';

  const staticEntries: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/teams`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/facilities`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/fixtures`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/events`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/calendar`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/news`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/publications`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/join`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/player-registration`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/kitchen`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/merchandise`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/sponsors`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/gallery`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/volunteer`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/committee/minutes`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
  ];

  if (await isDinoCoachPublic()) {
    staticEntries.push(
      { url: `${baseUrl}/fantasy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
      { url: `${baseUrl}/fantasy/rules`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
      { url: `${baseUrl}/fantasy/players`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
    );
  }
  if (await isRafflePublic()) {
    staticEntries.push({ url: `${baseUrl}/raffle`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 });
  }

  const detailEntries = await getPublishedDetailEntries(baseUrl);
  return [...staticEntries, ...detailEntries];
}
