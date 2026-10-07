import { loadPublicCatalogue } from '@/lib/apparel/public-catalogue';
import { getContentBlocks } from '@/lib/content-blocks';
import { isBuildPrerender } from '@/lib/server/build-phase';
import MerchandiseClient, { type ApiProduct } from './MerchandiseClient';
import { MERCH_CONTENT_BLOCK_KEYS, toMerchHeroContent } from './hero-content';

// ISR: regenerated at most every 60s and on demand after admin writes
// (lib/server/revalidate-public.ts: apparelProducts, apparelProductOptions and
// merchWindows all revalidate '/merchandise'). 'force-static' lets the
// Supabase reads, which use cache: 'no-store' fetches, run during static
// regeneration instead of opting the route into per-request rendering. This
// route reads no cookies, headers or searchParams: the payment-result query
// (?payment=, ?success=, ?cancelled=, ?session_id=) is read in the browser,
// and its noindex is sent as an X-Robots-Tag header by next.config.mjs.
// Order windows and payment capabilities stay live: the client fetches them
// on every load.
export const dynamic = 'force-static';
export const revalidate = 60;
// Title, description and canonical come from layout.tsx.

// A failed read is a temporary server error, never a fabricated empty
// catalogue. At runtime the error propagates, so ISR keeps serving the last
// good page (and a first request with no cached page shows error.tsx); only a
// build prerender renders the client's catalogue-unavailable state, which
// retries the live catalogue in the browser.
async function loadCatalogue(): Promise<ApiProduct[] | null> {
  try {
    return (await loadPublicCatalogue()) as unknown as ApiProduct[];
  } catch (error) {
    if (isBuildPrerender()) return null;
    throw error;
  }
}

export default async function MerchandisePage() {
  const [products, blocks] = await Promise.all([
    loadCatalogue(),
    getContentBlocks([...MERCH_CONTENT_BLOCK_KEYS]),
  ]);
  return <MerchandiseClient initialProducts={products} initialHeroContent={toMerchHeroContent(blocks)} />;
}
