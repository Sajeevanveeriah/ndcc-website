import 'server-only';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { COOKIE_DOUGH_DEADLINE_LABEL, COOKIE_DOUGH_ENDS_AT, isCookieDoughOpen } from '@/lib/cookie-dough';
import { COOKIE_DOUGH_FUNDRAISER_LINK } from '@/lib/public-links';
import { normalisePublicLinkUrl } from '@/lib/public-link-url';
import { detailString, resolvePromotion, type PromotionLookup, type SitePromotionRow } from '@/lib/promotion-rules';

export const SITE_PROMOTION_COLUMNS = 'id,slug,kind,title,body,link_url,link_label,image_url,starts_at,ends_at,placement,details,active,sort_order';

/**
 * Read every promotion row. Any failure (table not migrated yet, timeout,
 * missing configuration) reports 'unavailable' so callers keep the
 * hardcoded behaviour instead of hiding or breaking a promotion.
 */
export async function loadSitePromotions(options: { strict?: boolean } = {}): Promise<PromotionLookup> {
  // `strict` (the sitemap) reads uncached and throws on failure, so a
  // fallback answer is never cached in place of the live CMS rows.
  const strict = options.strict === true;
  if (!isServerSupabaseConfigured()) {
    if (strict) throw new Error('Site promotions unavailable');
    return { status: 'unavailable' };
  }
  try {
    const { data, error } = await createServerClient(strict ? { fetchTimeoutMs: 8_000 } : { publicReadCache: true, fetchTimeoutMs: 8_000 })
      .from('site_promotions')
      .select(SITE_PROMOTION_COLUMNS)
      .order('sort_order', { ascending: true });
    if (error || !Array.isArray(data)) {
      if (strict) throw new Error('Site promotions unavailable');
      return { status: 'unavailable' };
    }
    return { status: 'ok', rows: data as SitePromotionRow[] };
  } catch (error) {
    if (strict) throw error;
    return { status: 'unavailable' };
  }
}

export type CookieDoughCampaign = {
  /** Epoch ms at which the campaign closes, or null when open-ended. */
  endsAt: number | null;
  deadlineLabel: string;
  href: string;
};

const COOKIE_DOUGH_FALLBACK: CookieDoughCampaign = {
  endsAt: COOKIE_DOUGH_ENDS_AT,
  deadlineLabel: COOKIE_DOUGH_DEADLINE_LABEL,
  href: COOKIE_DOUGH_FUNDRAISER_LINK.href,
};

/**
 * The cookie dough campaign while it is open (CMS row 'cookie-dough' when
 * present, otherwise the hardcoded deadline and link), or null once closed.
 */
export async function getCookieDoughCampaign(now: number = Date.now(), options: { strict?: boolean } = {}): Promise<CookieDoughCampaign | null> {
  const lookup = await loadSitePromotions(options);
  return resolvePromotion(lookup, 'cookie-dough', now, { value: COOKIE_DOUGH_FALLBACK, live: isCookieDoughOpen(now) }, (row) => {
    const endsAt = row.ends_at ? Date.parse(row.ends_at) : null;
    return {
      endsAt: endsAt !== null && Number.isFinite(endsAt) ? endsAt : null,
      // A row without a deadline label shows none rather than a stale date.
      deadlineLabel: detailString(row, 'deadlineLabel', endsAt === COOKIE_DOUGH_ENDS_AT ? COOKIE_DOUGH_DEADLINE_LABEL : ''),
      href: normalisePublicLinkUrl(row.link_url) ?? COOKIE_DOUGH_FALLBACK.href,
    };
  });
}
