import { getClubSettings } from '@/lib/club-settings';
import { getContentBlocks, type ContentBlock } from '@/lib/content-blocks';
import { getPageLinkCards, type PageLinkCard } from '@/lib/structured-content';

export type SiteChromeData = {
  settings: Awaited<ReturnType<typeof getClubSettings>>;
  acknowledgement: ContentBlock | null;
  quickLinks: PageLinkCard[];
  getInvolvedLinks: PageLinkCard[];
  affiliationLinks: PageLinkCard[];
};

async function getSiteChromeDataUncached(): Promise<SiteChromeData> {
  const [settings, blocks, quickLinks, getInvolvedLinks, affiliationLinks] = await Promise.all([
    getClubSettings(),
    getContentBlocks(['footer.acknowledgement']),
    getPageLinkCards('site', 'footer_quick_links'),
    getPageLinkCards('site', 'footer_get_involved'),
    getPageLinkCards('site', 'footer_affiliations'),
  ]);

  return {
    settings,
    acknowledgement: blocks['footer.acknowledgement'] ?? null,
    quickLinks,
    getInvolvedLinks,
    affiliationLinks,
  };
}

// Uncached live read: the footer/navbar chrome must reflect admin edits at
// request time. Caching this snapshot let a build-phase fallback render stick
// in the Data Cache and alternate with live content in production.
export const getSiteChromeData = getSiteChromeDataUncached;
