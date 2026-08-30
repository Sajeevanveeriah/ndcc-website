const GOOGLE_MAPS_EMBED_HOSTS = new Set(['www.google.com']);
const GOOGLE_MAPS_EMBED_PATH = '/maps/embed';
const MAX_GOOGLE_MAPS_EMBED_URL_LENGTH = 2_048;

/** Return a canonical Google Maps embed URL, or null for every other URL. */
export function normaliseGoogleMapsEmbedUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_GOOGLE_MAPS_EMBED_URL_LENGTH) return null;
  const authority = candidate.match(/^https:\/\/([^/?#]+)(?:\/|$)/i)?.[1]?.toLowerCase();
  if (authority !== 'www.google.com') return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:'
      || !GOOGLE_MAPS_EMBED_HOSTS.has(url.hostname.toLowerCase())
      || url.pathname !== GOOGLE_MAPS_EMBED_PATH
      || url.username
      || url.password
      || url.port
      || url.hash) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function resolveGoogleMapsEmbedUrl(value: unknown, fallback: unknown): string | null {
  return normaliseGoogleMapsEmbedUrl(value) || normaliseGoogleMapsEmbedUrl(fallback);
}
