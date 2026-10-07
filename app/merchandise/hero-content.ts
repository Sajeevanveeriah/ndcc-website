import { CLUB_NAME } from '@/lib/constants';

export type MerchHeroContent = { title: string; body: string; orderTitle: string; orderBody: string };

export const MERCH_CONTENT_BLOCK_KEYS = ['merch.hero', 'merch.ordering'] as const;

type BlockLike = { title?: string | null; body?: string | null } | undefined;

/**
 * Maps the merch.hero / merch.ordering content blocks to the page copy, with
 * the same defaults the page has always used. Moved from the client loader so
 * the server renders the CMS copy on first paint.
 */
export function toMerchHeroContent(blocks: Record<string, BlockLike> | null | undefined): MerchHeroContent {
  const hero = blocks?.['merch.hero'];
  const ordering = blocks?.['merch.ordering'];
  const orderingBody = ordering?.body || '';
  return {
    title: hero?.title || 'Club Merchandise',
    body: hero?.body || `Show your Dinos pride with official ${CLUB_NAME} gear. All merchandise is available for order online and collection from the club.`,
    orderTitle: ordering?.title || 'Ordering Information',
    orderBody: orderingBody.startsWith('Use this section to provide') ? '' : orderingBody,
  };
}
