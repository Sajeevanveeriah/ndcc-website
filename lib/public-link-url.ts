const MAX_PUBLIC_LINK_URL_LENGTH = 2048;
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f-\u009f\\]/u;
const ENCODED_CONTROL_OR_BACKSLASH = /%(?:0[0-9a-f]|1[0-9a-f]|5c|7f|8[0-9a-f]|9[0-9a-f])/i;
const MALFORMED_PERCENT_ESCAPE = /%(?![0-9a-f]{2})/i;

/**
 * Canonicalise a public, clickable link. Only root-relative site paths and
 * absolute HTTPS URLs are allowed; every other URL surface fails closed.
 */
export function normalisePublicLinkUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_PUBLIC_LINK_URL_LENGTH) return null;
  if (
    CONTROL_OR_BACKSLASH.test(value)
    || ENCODED_CONTROL_OR_BACKSLASH.test(value)
    || MALFORMED_PERCENT_ESCAPE.test(value)
  ) return null;

  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_PUBLIC_LINK_URL_LENGTH || candidate.startsWith('//')) return null;

  try {
    if (candidate.startsWith('/')) {
      const base = new URL('https://ndcc.invalid');
      const parsed = new URL(candidate, base);
      if (parsed.origin !== base.origin) return null;
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    if (!/^https:\/\//i.test(candidate) || /^https:\/\/\//i.test(candidate)) return null;
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function resolvePublicLinkUrl(value: unknown, fallback?: unknown): string | null {
  return normalisePublicLinkUrl(value) ?? normalisePublicLinkUrl(fallback);
}
