import { unstable_cache } from 'next/cache';
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

export const getSiteChromeData = unstable_cache(getSiteChromeDataUncached, ['site-chrome-data'], {
  revalidate: 300,
  tags: ['site-chrome', 'club-settings', 'content-blocks', 'page-link-cards'],
});
