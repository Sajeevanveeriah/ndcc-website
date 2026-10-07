/**
 * Shared Vercel CDN cache policy for public, read-only API responses
 * (no imports: tested directly by scripts/test-public-api-cache.cjs).
 *
 * The production database sits behind a small PostgREST pool (see
 * lib/server/public-read-cache.ts). Letting Vercel's edge share a successful
 * public response for 30 s (and serve it stale for up to 120 s more while it
 * revalidates in the background) means a burst of visitors or crawlers costs
 * one function invocation and one database read per region, not one each.
 *
 * Rules every caller must follow:
 * - only for responses that are identical for every visitor: no cookies,
 *   session, auth, preview/draft mode or requester-dependent output, and no
 *   payment or order data;
 * - only for successful, live (non-degraded, non-fallback) results: pass
 *   `cacheable = false` for errors, 4xx/5xx and fallback content so an outage
 *   is never pinned at the edge;
 * - browsers keep the route's own `Cache-Control` (normally no-store), so only
 *   the shared CDN copy is reused. `Vercel-CDN-Cache-Control` is consumed by
 *   Vercel and is not forwarded to browsers or downstream proxies.
 */
export const PUBLIC_CDN_CACHE_CONTROL = 'public, s-maxage=30, stale-while-revalidate=120';

export function withPublicCdnCache(
  headers: Record<string, string>,
  cacheable: boolean,
): Record<string, string> {
  if (!cacheable) return { ...headers };
  return { ...headers, 'Vercel-CDN-Cache-Control': PUBLIC_CDN_CACHE_CONTROL };
}
