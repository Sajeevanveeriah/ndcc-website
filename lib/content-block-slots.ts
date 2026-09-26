// Page section keys that public pages actually request (see the
// getContentBlocks calls in app/ and lib/site-chrome.ts). New sections can
// only be created for these keys, so a section created in /admin/content
// always has somewhere to appear. Add a key here when a page starts rendering it.
export const RENDERED_CONTENT_BLOCK_KEYS = [
  'home.hero', 'home.juniors', 'home.quicklinks', 'home.season_status', 'home.welcome', 'home.sponsor_intro', 'home.sponsorship',
  'about.hero', 'about.history', 'about.affiliation', 'about.goodsports', 'about.partnership', 'about.committee',
  'contact.hero', 'contact.form_intro', 'contact.details',
  'facilities.hero', 'facilities.intro', 'facilities.training', 'facilities.features_intro', 'facilities.cta',
  'fixtures.hero', 'fixtures.status', 'fixtures.team_links',
  'join.hero',
  'sponsors.hero', 'sponsors.intro',
  'volunteer.hero',
  'footer.acknowledgement',
] as const;

export function isRenderedContentBlockKey(key: unknown): boolean {
  return typeof key === 'string' && (RENDERED_CONTENT_BLOCK_KEYS as readonly string[]).includes(key);
}

/** Rendered keys for one page (key prefix = page slug with hyphens as underscores). */
export function renderedKeysForPage(pageSlug: string): string[] {
  const prefix = `${pageSlug.replace(/-/g, '_')}.`;
  return RENDERED_CONTENT_BLOCK_KEYS.filter(key => key.startsWith(prefix));
}
