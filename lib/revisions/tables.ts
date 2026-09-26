// Tables whose previous versions and deletions are archived in
// public.editorial_revisions. The first four use the original versioned
// trigger (with a revision column and stale-save check); the rest use the
// exception-safe generic archive trigger added in
// supabase/migrations/20260927080000_revision_history_and_audit_log.sql.
// club_settings is deliberately absent: its primary key is the text value
// 'default', which does not fit editorial_revisions.record_id (uuid). Its
// changes are recorded in the admin audit log instead.
//
// Keep this module free of runtime imports so it can be unit tested directly.

export type RevisionTable = {
  table: string;
  /** Key in the /api/admin/resources/[resource] map (also used for revalidation). */
  resource: string;
  label: string;
  /** Admin page where the record is edited. */
  href: string;
  /** Snapshot fields tried in order to describe the record to a person. */
  titleFields: readonly string[];
  /** True for tables with a revision column and optimistic stale-save check. */
  versioned?: boolean;
};

export const REVISION_TABLES: readonly RevisionTable[] = [
  { table: 'news', resource: 'news', label: 'News', href: '/admin/news', titleFields: ['title'], versioned: true },
  { table: 'publications', resource: 'publications', label: 'Publications', href: '/admin/publications', titleFields: ['title', 'slug'], versioned: true },
  { table: 'events', resource: 'events', label: 'Events', href: '/admin/events', titleFields: ['title'], versioned: true },
  { table: 'content_blocks', resource: 'contentBlocks', label: 'Page sections', href: '/admin/content', titleFields: ['section_label', 'title', 'block_key'], versioned: true },
  { table: 'sponsors', resource: 'sponsors', label: 'Sponsors', href: '/admin/sponsors', titleFields: ['name'] },
  { table: 'player_sponsors', resource: 'playerSponsors', label: 'Player sponsors', href: '/admin/sponsors/players', titleFields: ['player_name', 'sponsor_name'] },
  { table: 'teams', resource: 'teams', label: 'Teams', href: '/admin/teams', titleFields: ['name', 'grade'] },
  { table: 'season_appointments', resource: 'seasonAppointments', label: 'Appointments', href: '/admin/season-appointments', titleFields: ['name', 'role'] },
  { table: 'gallery_albums', resource: 'galleryAlbums', label: 'Gallery albums', href: '/admin/gallery', titleFields: ['title', 'slug'] },
  { table: 'gallery_images', resource: 'galleryImages', label: 'Gallery images', href: '/admin/gallery', titleFields: ['title', 'alt_text', 'caption'] },
  { table: 'page_link_cards', resource: 'pageLinkCards', label: 'Page link cards', href: '/admin/site-pages', titleFields: ['title', 'href'] },
  { table: 'facility_features', resource: 'facilityFeatures', label: 'Facility features', href: '/admin/site-pages', titleFields: ['title'] },
  { table: 'history_lineage_entries', resource: 'historyLineage', label: 'History lineage', href: '/admin/history', titleFields: ['club_name'] },
  { table: 'history_premierships', resource: 'historyPremierships', label: 'Premierships', href: '/admin/history', titleFields: ['team_label', 'season_label'] },
  { table: 'history_competitions', resource: 'historyCompetitions', label: 'Competitions', href: '/admin/history', titleFields: ['name', 'abbreviation'] },
  { table: 'committee_members', resource: 'committeeMembers', label: 'Committee members', href: '/admin/history', titleFields: ['name', 'role'] },
  { table: 'apparel_products', resource: 'apparelProducts', label: 'Merchandise products', href: '/admin/apparel', titleFields: ['name', 'slug'] },
  { table: 'kitchen_menus', resource: 'kitchenMenus', label: 'Kitchen menus', href: '/admin/kitchen', titleFields: ['name'] },
  { table: 'kitchen_items', resource: 'kitchenItems', label: 'Kitchen items', href: '/admin/kitchen', titleFields: ['name'] },
  { table: 'social_membership_plans', resource: 'membershipPlans', label: 'Membership plans', href: '/admin/memberships', titleFields: ['name'] },
];

const BY_TABLE = new Map(REVISION_TABLES.map((entry) => [entry.table, entry]));

export function revisionTable(table: string): RevisionTable | undefined {
  return BY_TABLE.get(table);
}

export function hasRevisionHistory(table: string): boolean {
  return BY_TABLE.has(table);
}

/** Archived deletions older than this are hidden from Trash (never deleted). */
export const TRASH_RETENTION_DAYS = 90;

export function trashCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** Best human-readable label for an archived row. Never throws. */
export function describeSnapshot(table: string, snapshot: Record<string, unknown> | null | undefined): string {
  if (!snapshot || typeof snapshot !== 'object') return 'Untitled record';
  const config = BY_TABLE.get(table);
  const parts: string[] = [];
  for (const field of config?.titleFields ?? ['title', 'name']) {
    const value = snapshot[field];
    if (typeof value === 'string' && value.trim()) parts.push(value.trim());
    if (parts.length === 2) break;
  }
  if (parts.length === 0) return 'Untitled record';
  return parts.join(' - ').slice(0, 160);
}
