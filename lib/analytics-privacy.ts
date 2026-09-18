// Never send account tokens, search values or CMS paths to visitor analytics.
export function sanitiseAnalyticsEvent<T extends { url: string }>(event: T): T | null {
  try {
    const url = new URL(event.url);
    if (/^\/(admin|api|auth)(\/|$)/.test(url.pathname)) return null;
    url.search = '';
    url.hash = '';
    return { ...event, url: url.toString() };
  } catch {
    return null;
  }
}
