// Media library reference check. A library file may be deleted only when no
// known CMS column mentions its storage path. No imports, so tests can load
// it directly with --experimental-strip-types.

export type MediaReferenceColumn = { table: string; column: string; label: string };

/** Every CMS column known to hold uploaded media URLs (or text embedding them). */
export const MEDIA_REFERENCE_COLUMNS: readonly MediaReferenceColumn[] = [
  { table: 'news', column: 'image_url', label: 'News cover image' },
  { table: 'news', column: 'content', label: 'News article content' },
  { table: 'events', column: 'image_url', label: 'Event image' },
  { table: 'calendar_events', column: 'image_url', label: 'Calendar event image' },
  { table: 'sponsors', column: 'logo_url', label: 'Sponsor logo' },
  { table: 'player_sponsors', column: 'logo_url', label: 'Player sponsor logo' },
  { table: 'player_sponsors', column: 'player_image_url', label: 'Player sponsor photo' },
  { table: 'gallery_images', column: 'image_url', label: 'Gallery image' },
  { table: 'gallery_images', column: 'original_url', label: 'Gallery original' },
  { table: 'gallery_albums', column: 'cover_image_url', label: 'Gallery album cover' },
  { table: 'content_blocks', column: 'image_url', label: 'Page section image' },
  { table: 'content_blocks', column: 'body', label: 'Page section text' },
  { table: 'content_blocks', column: 'cta_url', label: 'Page section button' },
  { table: 'page_link_cards', column: 'href', label: 'Page link card' },
  { table: 'teams', column: 'image_url', label: 'Team image' },
  { table: 'season_appointments', column: 'image_url', label: 'Appointment photo' },
  { table: 'committee_members', column: 'image_url', label: 'Committee member photo' },
  { table: 'kitchen_items', column: 'image_url', label: 'Kitchen item image' },
  { table: 'apparel_products', column: 'image_url', label: 'Merchandise image' },
  { table: 'publications', column: 'cover_image_url', label: 'Publication cover' },
  { table: 'publications', column: 'document_url', label: 'Publication document' },
  { table: 'publications', column: 'content', label: 'Publication content' },
  { table: 'site_promotions', column: 'image_url', label: 'Promotion image' },
  { table: 'site_promotions', column: 'link_url', label: 'Promotion link' },
  { table: 'newsletter_sends', column: 'body', label: 'Newsletter' },
];

export type ReferenceQueryResult = { count: number | null; error: { code?: string; message?: string } | null };
export type ReferenceQuery = (table: string, column: string, pattern: string) => Promise<ReferenceQueryResult>;

export type MediaReferenceReport =
  | { status: 'unreferenced' }
  | { status: 'referenced'; references: Array<{ label: string; count: number }> }
  | { status: 'unknown'; reason: string };

// Missing tables/columns (an optional feature not migrated yet) cannot hold references.
const MISSING_OBJECT_CODES = new Set(['42P01', '42703', 'PGRST204', 'PGRST205']);

function isMissingObject(error: { code?: string; message?: string }) {
  if (error.code && MISSING_OBJECT_CODES.has(error.code)) return true;
  return /does not exist|could not find the .* (table|column)/i.test(error.message || '');
}

/** Escape LIKE wildcards so the storage path is matched literally. */
export function likePatternForPath(path: string): string {
  return `%${path.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * The storage path (content hash) is unique, so a substring match on it finds
 * the file whatever host or URL form was stored. Any other query failure
 * makes the result 'unknown' and callers must refuse to delete.
 */
export async function checkMediaReferences(
  path: string,
  query: ReferenceQuery,
  columns: readonly MediaReferenceColumn[] = MEDIA_REFERENCE_COLUMNS,
): Promise<MediaReferenceReport> {
  const trimmed = path.trim();
  if (trimmed.length < 8) return { status: 'unknown', reason: 'The file path is too short to check safely.' };
  const pattern = likePatternForPath(trimmed);
  const results = await Promise.all(columns.map(async (column) => {
    try {
      return { column, result: await query(column.table, column.column, pattern) };
    } catch (error) {
      return { column, result: { count: null, error: { message: error instanceof Error ? error.message : 'query failed' } } };
    }
  }));
  const references: Array<{ label: string; count: number }> = [];
  for (const { column, result } of results) {
    if (result.error) {
      if (isMissingObject(result.error)) continue;
      return { status: 'unknown', reason: `Could not check ${column.label.toLowerCase()} references.` };
    }
    if (result.count === null) return { status: 'unknown', reason: `Could not count ${column.label.toLowerCase()} references.` };
    if (result.count > 0) references.push({ label: column.label, count: result.count });
  }
  return references.length ? { status: 'referenced', references } : { status: 'unreferenced' };
}
