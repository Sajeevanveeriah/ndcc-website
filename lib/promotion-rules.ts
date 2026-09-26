// Pure promotion selection rules shared by the public helpers, the admin API
// and tests. No imports, so tests can load it with --experimental-strip-types.

export type PromotionKind = 'home_banner' | 'fundraiser';

export type SitePromotionRow = {
  id?: string;
  slug: string;
  kind: PromotionKind | string;
  title: string | null;
  body: string | null;
  link_url: string | null;
  link_label: string | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  placement: string | null;
  details: Record<string, unknown> | null;
  active: boolean;
  sort_order: number | null;
};

/**
 * 'ok' means the table answered (rows may be empty); 'unavailable' means the
 * table is missing or the read failed, so callers use hardcoded fallbacks.
 */
export type PromotionLookup =
  | { status: 'ok'; rows: SitePromotionRow[] }
  | { status: 'unavailable' };

function instant(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Inclusive start, exclusive end, matching isPromotionActive. Open-ended when a bound is null. */
export function isWithinPromotionWindow(
  row: { starts_at: string | null; ends_at: string | null },
  now: number = Date.now(),
): boolean {
  const start = instant(row.starts_at);
  const end = instant(row.ends_at);
  if (row.starts_at && start === null) return false;
  if (row.ends_at && end === null) return false;
  if (start !== null && now < start) return false;
  if (end !== null && now >= end) return false;
  return true;
}

export function isPromotionLive(row: SitePromotionRow, now: number = Date.now()): boolean {
  return row.active === true && isWithinPromotionWindow(row, now);
}

/**
 * Resolve one promotion by slug.
 * - table unavailable, or the slug has no row: use the fallback (itself date-gated);
 * - row present but inactive or outside its dates: hidden (null);
 * - row live: mapped from the CMS row.
 */
export function resolvePromotion<T>(
  lookup: PromotionLookup,
  slug: string,
  now: number,
  fallback: { value: T; live: boolean },
  map: (row: SitePromotionRow) => T,
): T | null {
  if (lookup.status !== 'ok') return fallback.live ? fallback.value : null;
  const row = lookup.rows.find((candidate) => candidate.slug === slug);
  if (!row) return fallback.live ? fallback.value : null;
  return isPromotionLive(row, now) ? map(row) : null;
}

/** A string detail value, or the fallback when absent/blank/not a string. */
export function detailString(row: SitePromotionRow, key: string, fallback: string): string {
  const value = row.details && typeof row.details === 'object' ? row.details[key] : undefined;
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function textOr(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
