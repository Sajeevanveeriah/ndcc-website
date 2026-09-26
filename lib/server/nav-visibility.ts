import 'server-only';

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { getSiteChromeData, type SiteChromeData } from '@/lib/site-chrome';
import { getPageLinkCards } from '@/lib/structured-content';
import { isDinoCoachPublic } from '@/lib/dino-coach/public-visibility';
import { isRafflePublic } from '@/lib/raffle-visibility';
import { isPrizeWheelPublic } from '@/lib/prize-wheel/server';
import { getPublicPlayerRegistration } from '@/lib/public-player-registration';
import { fallbackClubSettings } from '@/lib/club-settings-types';
import { isPublicSupabaseConfigured, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { NAV_LINKS } from '@/lib/constants';

/**
 * Server-computed site chrome shared by the root layout (Navbar props) and the
 * Footer. Previously the Navbar made six client fetches on mount and four on
 * every route change, and the Footer queried Supabase on every request.
 *
 * Results are held in the Next.js Data Cache for at most
 * SITE_CHROME_REVALIDATE_SECONDS and are invalidated on demand by admin writes
 * via `revalidatePublicContent()` (tag SITE_CHROME_TAG).
 *
 * A degraded snapshot (Supabase unconfigured, or the club settings / link
 * queries fell back because the database was unreachable) is NEVER written to
 * the cache: the cached function throws so unstable_cache stores nothing, and
 * the caller renders the same fallback it always did for that one render.
 * This keeps a build-time or outage fallback from sticking for the whole
 * revalidation window.
 */

export const SITE_CHROME_TAG = 'site-chrome';
export const SITE_CHROME_REVALIDATE_SECONDS = 60;

export type NavHeaderLink = {
  id?: string;
  label: string;
  href: string;
  openInNewTab?: boolean;
};

export type NavRegistration = { label: string; href: '/player-registration' } | null;

export type NavSettings = {
  club_short: string;
  established_year: number | null;
  ground_name: string | null;
  address: string | null;
  facebook_url: string | null;
  playhq_url: string | null;
};

export type NavVisibility = {
  dinoCoachPublic: boolean;
  rafflePublic: boolean;
  reverseRafflePublic: boolean;
  /** Optional so snapshots cached before the prize wheel shipped stay valid. */
  prizeWheelPublic?: boolean;
  registration: NavRegistration;
  settings: NavSettings;
  headerLinks: NavHeaderLink[];
};

export type SiteChromeSnapshot = {
  chrome: SiteChromeData;
  nav: NavVisibility;
};

class DegradedSnapshotError extends Error {
  constructor() {
    super('Site chrome snapshot is degraded; not caching.');
    this.name = 'DegradedSnapshotError';
  }
}

const defaultHeaderLinks = (): NavHeaderLink[] => NAV_LINKS.map((link) => ({ ...link }));

function navSettingsFrom(settings: SiteChromeData['settings']): NavSettings {
  return {
    club_short: settings.club_short,
    established_year: settings.established_year,
    ground_name: settings.ground_name,
    address: settings.address,
    facebook_url: settings.facebook_url,
    playhq_url: settings.playhq_url,
  };
}

// Same visibility rule the Navbar previously applied client-side to the
// /api/public/player-registration response.
function registrationNavigation(registration: Awaited<ReturnType<typeof getPublicPlayerRegistration>>): NavRegistration {
  const visible = Boolean(
    registration
    && registration.showInNavigation === true
    && registration.availability !== 'closed'
    && Array.isArray(registration.options)
    && registration.options.length > 0,
  );
  return visible && registration
    ? { label: String(registration.navigationLabel || 'Player Registration'), href: '/player-registration' }
    : null;
}

async function buildSnapshot(): Promise<{ snapshot: SiteChromeSnapshot; degraded: boolean }> {
  const [chrome, headerCards, dinoCoachPublic, rafflePublic, reverseRafflePublic, registration, prizeWheelPublic] = await Promise.all([
    getSiteChromeData(),
    getPageLinkCards('site', 'header_nav'),
    isDinoCoachPublic(),
    isRafflePublic(),
    isRafflePublic('NDCCRRO'),
    getPublicPlayerRegistration(),
    isPrizeWheelPublic(),
  ]);

  const isFallbackCard = (card: { id: string }) => card.id.startsWith('fallback-');
  const degraded = !isPublicSupabaseConfigured()
    || !isServerSupabaseConfigured()
    || chrome.settings === fallbackClubSettings
    || headerCards.some(isFallbackCard)
    || chrome.quickLinks.some(isFallbackCard);

  // Matches the previous client behaviour: CMS header links (when any are
  // configured) supply labels for matching hrefs; otherwise NAV_LINKS does.
  // Local routes never open in a new tab, even if a CMS row is mis-flagged.
  const liveHeaderLinks = headerCards.filter((card) => !isFallbackCard(card));
  const headerLinks = liveHeaderLinks.length > 0
    ? liveHeaderLinks.map((card) => ({
      id: card.id,
      label: card.title,
      href: card.href,
      openInNewTab: /^https?:\/\//i.test(card.href),
    }))
    : defaultHeaderLinks();

  return {
    degraded,
    snapshot: {
      chrome,
      nav: {
        dinoCoachPublic,
        rafflePublic,
        reverseRafflePublic,
        prizeWheelPublic,
        registration: registrationNavigation(registration),
        settings: navSettingsFrom(chrome.settings),
        headerLinks,
      },
    },
  };
}

const CACHE_KEY = ['site-chrome-snapshot-v1'];
const CACHE_OPTIONS = { revalidate: SITE_CHROME_REVALIDATE_SECONDS, tags: [SITE_CHROME_TAG] };

function emergencyFallbackSnapshot(): SiteChromeSnapshot {
  return {
    chrome: {
      settings: fallbackClubSettings,
      acknowledgement: null,
      quickLinks: [],
      getInvolvedLinks: [],
      affiliationLinks: [],
    },
    nav: {
      dinoCoachPublic: false,
      rafflePublic: false,
      reverseRafflePublic: false,
      prizeWheelPublic: false,
      registration: null,
      settings: navSettingsFrom(fallbackClubSettings),
      headerLinks: defaultHeaderLinks(),
    },
  };
}

/**
 * Cached (<=60s, tag-invalidated) site chrome for the Navbar and Footer.
 * Never throws: a degraded read is rendered for this request only (exactly as
 * the previous per-request code did) and is not stored in the cache.
 */
async function getSiteChromeSnapshotUncached(): Promise<SiteChromeSnapshot> {
  let uncachedResult: SiteChromeSnapshot | null = null;
  try {
    return await unstable_cache(async (): Promise<SiteChromeSnapshot> => {
      const { snapshot, degraded } = await buildSnapshot();
      if (degraded) {
        uncachedResult = snapshot;
        throw new DegradedSnapshotError();
      }
      return snapshot;
    }, CACHE_KEY, CACHE_OPTIONS)();
  } catch {
    if (uncachedResult) return uncachedResult;
    try {
      return (await buildSnapshot()).snapshot;
    } catch {
      return emergencyFallbackSnapshot();
    }
  }
}

// Request-scoped dedupe: the root layout (Navbar) and the Footer share one read.
export const getSiteChromeSnapshot = cache(getSiteChromeSnapshotUncached);

export async function getNavVisibility(): Promise<NavVisibility> {
  return (await getSiteChromeSnapshot()).nav;
}
