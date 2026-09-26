// Global admin search: which sources a user may search and how each is
// queried. Pure and import-free (type-only imports) so it can be unit tested.
import type { PermissionKey } from '@/lib/auth/permissions';

export type SearchSource = {
  key: string;
  label: string;
  table: string;
  permission: PermissionKey;
  /** Columns matched with a case-insensitive contains filter. */
  searchFields: readonly string[];
  select: string;
  /** Column used as the result title. */
  titleField: string;
  /** Optional columns shown as supporting detail. */
  detailFields?: readonly string[];
  href: string;
  order?: { column: string; ascending: boolean };
  /** Extra fixed filter, e.g. hide soft-deleted orders. */
  excludeDeleted?: boolean;
};

export const SEARCH_SOURCES: readonly SearchSource[] = [
  { key: 'news', label: 'News', table: 'news', permission: 'news', searchFields: ['title'], select: 'id,title,published', titleField: 'title', href: '/admin/news', order: { column: 'created_at', ascending: false } },
  { key: 'publications', label: 'Publications', table: 'publications', permission: 'publications', searchFields: ['title', 'slug'], select: 'id,title,slug,issue_date', titleField: 'title', detailFields: ['issue_date'], href: '/admin/publications', order: { column: 'issue_date', ascending: false } },
  { key: 'events', label: 'Events', table: 'events', permission: 'events', searchFields: ['title', 'location'], select: 'id,title,date,location', titleField: 'title', detailFields: ['date', 'location'], href: '/admin/events', order: { column: 'date', ascending: false } },
  { key: 'sponsors', label: 'Sponsors', table: 'sponsors', permission: 'sponsors', searchFields: ['name'], select: 'id,name,tier', titleField: 'name', detailFields: ['tier'], href: '/admin/sponsors', order: { column: 'sort_order', ascending: true } },
  { key: 'teams', label: 'Teams', table: 'teams', permission: 'teams', searchFields: ['name', 'grade'], select: 'id,name,grade', titleField: 'name', detailFields: ['grade'], href: '/admin/teams', order: { column: 'sort_order', ascending: true } },
  { key: 'gallery', label: 'Gallery albums', table: 'gallery_albums', permission: 'gallery', searchFields: ['title', 'slug'], select: 'id,title,slug,season_label', titleField: 'title', detailFields: ['season_label'], href: '/admin/gallery', order: { column: 'sort_order', ascending: true } },
  { key: 'members', label: 'Members directory', table: 'club_member_directory', permission: 'memberships', searchFields: ['full_name', 'email'], select: 'id,full_name,email,source,status', titleField: 'full_name', detailFields: ['email', 'status'], href: '/admin/memberships', order: { column: 'full_name', ascending: true } },
  { key: 'orders', label: 'Orders', table: 'orders', permission: 'orders', searchFields: ['payment_reference'], select: 'id,payment_reference,customer_name,order_category,payment_status', titleField: 'payment_reference', detailFields: ['customer_name', 'order_category', 'payment_status'], href: '/admin/orders', order: { column: 'created_at', ascending: false }, excludeDeleted: true },
];

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 80;
export const SEARCH_RESULTS_PER_SOURCE = 8;

/** Only sources whose permission the user holds (full-access roles hold every permission). */
export function searchSourcesForUser(user: { permissions: readonly string[] } | null | undefined): SearchSource[] {
  if (!user || !Array.isArray(user.permissions)) return [];
  const held = new Set(user.permissions);
  return SEARCH_SOURCES.filter((source) => held.has(source.permission));
}

/**
 * Normalise a query for use inside a PostgREST `or=(... ilike ...)` filter.
 * Keeps letters, numbers, spaces and @ . + - (emails and references); drops
 * characters with filter meaning (commas, brackets, wildcards, quotes).
 * Returns '' when too short to search.
 */
export function sanitiseSearchTerm(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.normalize('NFKC').replace(/[^\p{L}\p{N} @.+-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, SEARCH_MAX_LENGTH);
  return cleaned.length >= SEARCH_MIN_LENGTH ? cleaned : '';
}

export function buildSearchFilter(source: SearchSource, term: string): string {
  return source.searchFields.map((field) => `${field}.ilike.*${term}*`).join(',');
}

export type SearchResult = { source: string; label: string; id: string; title: string; detail: string; href: string };

export function toSearchResult(source: SearchSource, row: Record<string, unknown>): SearchResult {
  const title = String(row[source.titleField] ?? '').trim() || 'Untitled';
  const detail = (source.detailFields ?? [])
    .map((field) => row[field])
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
    .map((value) => String(value).trim())
    .join(' - ');
  return { source: source.key, label: source.label, id: String(row.id ?? ''), title, detail, href: source.href };
}
