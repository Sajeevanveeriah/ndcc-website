import 'server-only';

import { revalidatePath, revalidateTag } from 'next/cache';
import { SITE_CHROME_TAG } from '@/lib/server/nav-visibility';
import { SITEMAP_CACHE_TAG } from '@/lib/seo-sitemap';

/**
 * On-demand revalidation for the ISR public pages.
 *
 * Public content pages are statically regenerated at most every 60s (300s for
 * about/facilities). Admin write paths call this after a successful mutation
 * so the change is visible on the next request instead of after the window.
 *
 * Every call is best-effort: revalidation must never turn a saved admin
 * change into an error response.
 */

type Detail = { id?: string | null; slug?: string | null };

/** Resources that feed the shared Navbar/Footer snapshot (lib/server/nav-visibility.ts). */
const SITE_CHROME_RESOURCES = new Set([
  'clubSettings',
  'pageLinkCards',
  'contentBlocks',
  'raffleCampaigns',
  'fantasySettings',
  'fantasySeasons',
  'clubSeasons',
  'playerRegistration',
]);

const RESOURCE_PATHS: Record<string, string[]> = {
  events: ['/', '/events', '/calendar'],
  calendarEvents: ['/', '/calendar', '/contact'],
  news: ['/', '/news'],
  publications: ['/', '/publications', '/newsletters', '/match-reports'],
  sponsors: ['/', '/sponsors'],
  playerSponsors: ['/', '/player-sponsors'],
  galleryImages: ['/', '/gallery'],
  galleryAlbums: ['/', '/gallery'],
  kitchenMenus: ['/kitchen'],
  kitchenItems: ['/kitchen'],
  seasonAppointments: ['/'],
  teams: ['/teams', '/fixtures', '/'],
  facilityFeatures: ['/facilities'],
  historyLineage: ['/about'],
  historyPremierships: ['/about', '/'],
  historyCompetitions: ['/about'],
  committeeMembers: ['/about', '/contact'],
  apparelProducts: ['/merchandise'],
  apparelProductOptions: ['/merchandise'],
  merchWindows: ['/merchandise'],
  raffleCampaigns: ['/', '/raffle', '/reverse-raffle'],
  playerRegistration: ['/player-registration', '/join', '/'],
  clubSeasons: ['/', '/fixtures', '/player-registration', '/join', '/sponsors'],
  fantasySettings: ['/', '/fantasy'],
  fantasySeasons: ['/', '/fantasy'],
  playhq: ['/', '/fixtures'],
};

/** Detail routes that are cached per path under ISR. */
function detailPaths(resource: string, detail?: Detail): string[] {
  if (!detail) return [];
  const id = typeof detail.id === 'string' && detail.id ? detail.id : null;
  const slug = typeof detail.slug === 'string' && detail.slug ? detail.slug : null;
  switch (resource) {
    case 'news': return id ? [`/news/${id}`] : [];
    case 'events': return id ? [`/events/${id}`] : [];
    case 'publications': return slug ? [`/publications/${slug}`] : [];
    case 'galleryAlbums':
    case 'galleryImages': return slug ? [`/gallery/${slug}`] : [];
    default: return [];
  }
}

/** Dynamic detail route patterns, used when a batch/unknown id changed. */
const DETAIL_PATTERNS: Record<string, string> = {
  news: '/news/[id]',
  events: '/events/[id]',
  publications: '/publications/[slug]',
  galleryAlbums: '/gallery/[slug]',
  galleryImages: '/gallery/[slug]',
};

function safe(fn: () => void) {
  try { fn(); } catch { /* best-effort: never fail an admin write */ }
}

/**
 * Clear the cached sitemap. revalidatePublicContent already does this; admin
 * writers that revalidate their own paths (gallery albums, promotions) call it
 * so a visibility change reaches /sitemap.xml immediately.
 */
export function revalidateSitemap(): void {
  safe(() => revalidateTag(SITEMAP_CACHE_TAG));
}

/**
 * Revalidate the public pages affected by a change to `resource`.
 * Unknown or omitted resources revalidate the whole site (`/`, 'layout'),
 * which also covers the shared Navbar/Footer chrome.
 */
export function revalidatePublicContent(resource?: string, detail?: Detail): void {
  // Any public content change can add or remove sitemap entries.
  revalidateSitemap();
  const paths = resource ? RESOURCE_PATHS[resource] : undefined;
  if (!resource || !paths) {
    safe(() => revalidatePath('/', 'layout'));
    safe(() => revalidateTag(SITE_CHROME_TAG));
    return;
  }

  for (const path of [...paths, ...detailPaths(resource, detail)]) safe(() => revalidatePath(path));
  const pattern = DETAIL_PATTERNS[resource];
  if (pattern && !detailPaths(resource, detail).length) safe(() => revalidatePath(pattern, 'page'));

  if (SITE_CHROME_RESOURCES.has(resource)) {
    // Navbar/Footer render in the root layout on every page, so a chrome
    // change must refresh every cached page as well as the shared snapshot.
    safe(() => revalidateTag(SITE_CHROME_TAG));
    safe(() => revalidatePath('/', 'layout'));
  }
}
