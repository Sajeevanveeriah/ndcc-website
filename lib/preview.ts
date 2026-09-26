// Draft-mode preview rules shared by /api/admin/preview, the public detail
// pages and tests. No imports, so tests can load it directly.
//
// Outside draft mode the public rules are unchanged: a record is visible only
// when published and its published_at (if any) has passed. Inside draft mode
// (enabled only by /api/admin/preview for a signed-in committee user) any
// record may be rendered, with a visible "Preview - not published" banner.

export type PreviewType = 'news' | 'event' | 'content';
export type PreviewPermission = 'news' | 'events' | 'content';

export const PREVIEW_PERMISSIONS: Readonly<Record<PreviewType, PreviewPermission>> = {
  news: 'news',
  event: 'events',
  content: 'content',
};

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// Public page for each content-block page_slug (see /admin/content).
const CONTENT_PAGE_PATHS: Readonly<Record<string, string>> = {
  home: '/', about: '/about', teams: '/teams', facilities: '/facilities', fixtures: '/fixtures',
  join: '/join', merchandise: '/merchandise', merch: '/merchandise', sponsors: '/sponsors', gallery: '/gallery',
  volunteer: '/volunteer', contact: '/contact', footer: '/', kitchen: '/kitchen', news: '/news', events: '/events',
};

export function isPreviewType(value: unknown): value is PreviewType {
  return value === 'news' || value === 'event' || value === 'content';
}

export function isPreviewId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** The public path a preview opens, or null when the request is invalid. */
export function previewPath(type: PreviewType, id: string, contentPageSlug?: string | null): string | null {
  if (!isPreviewId(id)) return null;
  if (type === 'news') return `/news/${id}`;
  if (type === 'event') return `/events/${id}`;
  return CONTENT_PAGE_PATHS[contentPageSlug || ''] ?? '/';
}

/** Only same-site absolute paths, so exit links cannot redirect elsewhere. */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f]/.test(value)) return '/';
  if (value.startsWith('/api/') || value.startsWith('/admin')) return '/';
  return value.length > 300 ? '/' : value;
}

export type Publishable = { published?: boolean | null; published_at?: string | null };

/** The unchanged public visibility rule. */
export function isPubliclyVisible(record: Publishable, now: number = Date.now()): boolean {
  if (record.published !== true) return false;
  if (!record.published_at) return true;
  const at = Date.parse(record.published_at);
  return Number.isFinite(at) && at <= now;
}

/** Whether a page may render this record: public rule, or anything while previewing. */
export function canRenderRecord(record: Publishable | null, draftMode: boolean, now: number = Date.now()): boolean {
  if (!record) return false;
  return draftMode || isPubliclyVisible(record, now);
}

/** Banner text for a record rendered in draft mode, or null when none is needed. */
export function previewBannerLabel(record: Publishable, draftMode: boolean, now: number = Date.now()): string | null {
  if (!draftMode) return null;
  if (isPubliclyVisible(record, now)) return 'Preview mode - this item is already published';
  if (record.published === true && record.published_at) return 'Preview - not published yet (scheduled)';
  return 'Preview - not published';
}
