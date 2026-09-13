import type { MetadataRoute } from 'next';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { isRaffleVisibleAt } from '@/lib/raffle-visibility-rules';
import { buildDetailEntries } from '@/lib/seo-sitemap';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Never publish a successful-looking partial sitemap after a database failure.
async function getPublishedDetailEntries(baseUrl: string): Promise<MetadataRoute.Sitemap> {
  if (!isServerSupabaseConfigured()) throw new Error('Sitemap data unavailable');
  const supabase = createServerClient({ fetchTimeoutMs: 5_000 });
  const now = new Date().toISOString();
  async function rows(table: string, columns: string, scheduled = false) {
    const all: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      let query = supabase.from(table).select(columns).eq('published', true).order('id').range(offset, offset + 499);
      if (scheduled) query = query.or(`published_at.is.null,published_at.lte.${now}`);
      const result = await query.returns<Record<string, unknown>[]>();
      if (result.error || !result.data) {
        console.error(`[sitemap] ${table} read failed`);
        throw new Error('Sitemap data unavailable');
      }
      all.push(...result.data);
      if (result.data.length < 500) return all;
    }
  }
  const [news, events, publications, albums] = await Promise.all([
    rows('news', 'id,title,published,published_at', true),
    rows('events', 'id,published'),
    rows('publications', 'id,slug,published,published_at,updated_at', true),
    rows('gallery_albums', 'id,slug,published'),
  ]);
  return buildDetailEntries(baseUrl, { news, events, publications, albums }, new Date(now));
}

async function isDinoCoachPublic(): Promise<boolean> {
  if (!isServerSupabaseConfigured()) throw new Error('Sitemap data unavailable');
  try {
    const supabase = createServerClient({ fetchTimeoutMs: 5_000 });
    const { data: season, error: seasonError } = await supabase.from('fantasy_seasons').select('id').eq('is_current', true).limit(1).maybeSingle();
    if (seasonError) throw new Error('Sitemap visibility unavailable');
    if (!season?.id) return false;
    const { data: settings, error: settingsError } = await supabase.from('fantasy_dino_settings').select('public_launch_enabled').eq('season_id', season.id).maybeSingle();
    if (settingsError) throw new Error('Sitemap visibility unavailable');
    return settings?.public_launch_enabled === true;
  } catch {
    throw new Error('Sitemap visibility unavailable');
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.ndcc.com.au';

  const staticEntries: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/about`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/teams`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/facilities`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/fixtures`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/events`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/fundraising/cookie-dough`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/calendar`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/news`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/publications`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/join`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/player-registration`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/kitchen`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/merchandise`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/player-sponsors`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/sponsors`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/gallery`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/volunteer`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/contact`, changeFrequency: 'monthly', priority: 0.7 },
  ];

  if (await isDinoCoachPublic()) {
    staticEntries.push(
      { url: `${baseUrl}/fantasy`, changeFrequency: 'monthly', priority: 0.6 },
      { url: `${baseUrl}/fantasy/rules`, changeFrequency: 'monthly', priority: 0.5 },
      { url: `${baseUrl}/fantasy/players`, changeFrequency: 'weekly', priority: 0.5 },
    );
  }
  const { data: raffle, error: raffleError } = await createServerClient().from('raffle_campaigns').select('active,public_visibility_mode,public_opens_at').eq('active', true).limit(1).maybeSingle();
  if (raffleError) throw new Error('Sitemap raffle visibility unavailable');
  if (isRaffleVisibleAt(raffle)) {
    staticEntries.push({ url: `${baseUrl}/raffle`, changeFrequency: 'weekly', priority: 0.8 });
  }

  const detailEntries = await getPublishedDetailEntries(baseUrl);
  return [...staticEntries, ...detailEntries];
}
