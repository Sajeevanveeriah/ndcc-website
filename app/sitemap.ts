import { isCookieDoughOpen } from '@/lib/cookie-dough';
import { getCookieDoughCampaign } from '@/lib/server/site-promotions';
import type { MetadataRoute } from 'next';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { isRaffleVisibleAt } from '@/lib/raffle-visibility-rules';
import { RAFFLE_CAMPAIGN_CODE, REVERSE_RAFFLE_CAMPAIGN_CODE } from '@/lib/raffle-constants';
import { isPrizeWheelPublic } from '@/lib/prize-wheel/server';
import { buildDetailEntries } from '@/lib/seo-sitemap';
import { SITE_URL } from '@/lib/seo';
import { getPublicPlayerRegistration } from '@/lib/public-player-registration';
import type { PublicPlayerRegistration } from '@/lib/player-registration';
import { buildTeamSlugs } from '@/lib/playhq/team-slug';

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
    // Scheduled events stay out until published_at; the retry covers a database
    // without the scheduling column.
    rows('events', 'id,published,published_at', true).catch(() => rows('events', 'id,published')),
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

// Same rule as the /player-registration page's "can register" state: the
// current season's registration is open (or taking a waitlist) and has at
// least one published option. Availability comes from getRegistrationAvailability
// via publicRegistrationFromRow.
function isPlayerRegistrationOpen(registration: PublicPlayerRegistration | null): boolean {
  return Boolean(
    registration
    && (registration.availability === 'open' || registration.availability === 'waitlist')
    && registration.options.length > 0,
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL;

  const staticEntries: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/about`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/teams`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/facilities`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/fixtures`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/events`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/calendar`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/news`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/publications`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/join`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/kitchen`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/merchandise`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/player-sponsors`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/sponsors`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/gallery`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/volunteer`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/contact`, changeFrequency: 'monthly', priority: 0.7 },
  ];

  if (isPlayerRegistrationOpen(await getPublicPlayerRegistration())) {
    staticEntries.push({ url: `${baseUrl}/player-registration`, changeFrequency: 'weekly', priority: 0.9 });
  }

  // Public team pages (/teams/[slug]) for every active team card. Same read
  // order and slug rule as lib/public-teams.ts getPublicTeamsWithSlugs().
  const { data: teamRows, error: teamsError } = await createServerClient({ fetchTimeoutMs: 5_000 }).from('teams').select('name,sort_order,is_active').eq('is_active', true).order('sort_order', { ascending: true }).order('name', { ascending: true });
  if (teamsError) throw new Error('Sitemap teams unavailable');
  for (const { slug } of buildTeamSlugs((teamRows || []) as Array<{ name: string }>)) {
    staticEntries.push({ url: `${baseUrl}/teams/${slug}`, changeFrequency: 'weekly', priority: 0.6 });
  }

  const cookieDoughOpen = await getCookieDoughCampaign().then((campaign) => campaign !== null, () => isCookieDoughOpen());
  if (cookieDoughOpen) staticEntries.push({ url: `${baseUrl}/fundraising/cookie-dough`, changeFrequency: 'weekly', priority: 0.8 });

  if (await isDinoCoachPublic()) {
    staticEntries.push(
      { url: `${baseUrl}/fantasy`, changeFrequency: 'monthly', priority: 0.6 },
      { url: `${baseUrl}/fantasy/rules`, changeFrequency: 'monthly', priority: 0.5 },
      { url: `${baseUrl}/fantasy/players`, changeFrequency: 'weekly', priority: 0.5 },
      { url: `${baseUrl}/fantasy/leaderboard`, changeFrequency: 'weekly', priority: 0.5 },
    );
  }
  const { data: raffle, error: raffleError } = await createServerClient().from('raffle_campaigns').select('code,active,public_visibility_mode,public_opens_at').eq('active', true);
  if (raffleError) throw new Error('Sitemap raffle visibility unavailable');
  for (const campaign of raffle || []) {
    if (!isRaffleVisibleAt(campaign)) continue;
    const route = campaign.code === REVERSE_RAFFLE_CAMPAIGN_CODE ? '/reverse-raffle' : campaign.code === RAFFLE_CAMPAIGN_CODE ? '/raffle' : null;
    if (route) staticEntries.push({ url: `${baseUrl}${route}`, changeFrequency: 'weekly', priority: 0.8 });
  }
  // Prize wheel: only while an active, publicly visible wheel campaign exists.
  if (await isPrizeWheelPublic()) staticEntries.push({ url: `${baseUrl}/prize-wheel`, changeFrequency: 'daily', priority: 0.6 });

  const detailEntries = await getPublishedDetailEntries(baseUrl);
  return [...staticEntries, ...detailEntries];
}
