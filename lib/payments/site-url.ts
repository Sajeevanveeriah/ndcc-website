import 'server-only';

function validatedOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)
      || url.username
      || url.password
      || url.search
      || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Checkout return URLs must never silently point to localhost in production.
 * Preview and local requests may safely use their own Request origin.
 */
export function getCheckoutSiteUrl(request: Request): string | null {
  const isProduction = process.env.VERCEL_ENV === 'production'
    || (process.env.NODE_ENV === 'production' && !process.env.VERCEL_ENV);
  const configured = String(process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  if (configured) {
    const origin = validatedOrigin(configured);
    if (!origin) return null;
    if (isProduction && !origin.startsWith('https://')) return null;
    return origin;
  }

  if (isProduction) return null;
  return validatedOrigin(new URL(request.url).origin);
}
