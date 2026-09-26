import type { MetadataRoute } from 'next';
import { unstable_cache } from 'next/cache';
import { buildSitemapEntries } from '@/lib/server/sitemap-entries';
import { SITEMAP_CACHE_TAG } from '@/lib/seo-sitemap';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// The sitemap reads several tables. Serve a successful build for up to five
// minutes (CMS writes clear it sooner via revalidatePublicContent). Failed
// builds throw, so nothing partial is ever cached; once a good copy exists,
// a failed background refresh keeps serving that complete copy.
const getCachedSitemap = unstable_cache(buildSitemapEntries, ['public-sitemap-v1'], {
  revalidate: 300,
  tags: [SITEMAP_CACHE_TAG],
});

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return getCachedSitemap();
}
