// Time-limited promotions shown on the home page. Dates and labels live here
// so a promotion can be updated or retired in one place; the page renders a
// promotion only while `isPromotionActive` is true (evaluated at render /
// ISR regeneration time).
//
// getJuniorGetActiveVouchers() reads the same promotion from the CMS
// (/admin/promotions, row 'junior-vouchers') and falls back to the values
// below when the promotions table is unavailable.

import { loadSitePromotions } from '@/lib/server/site-promotions';
import { detailString, resolvePromotion } from '@/lib/promotion-rules';
import { normalisePublicLinkUrl } from '@/lib/public-link-url';

export type HomePromotionWindow = {
  /** ISO 8601 instant from which the promotion is shown. */
  startsAt: string;
  /** ISO 8601 instant at which the promotion stops being shown. */
  endsAt: string;
};

// Victorian Government Get Active Kids vouchers, Round 11 (15 September to
// 10 am on 13 October 2026, Victorian time).
export const JUNIOR_GET_ACTIVE_VOUCHERS = {
  startsAt: '2026-09-15T00:00:00+10:00',
  endsAt: '2026-10-13T10:00:00+11:00',
  anchorId: 'junior-vouchers',
  heroLinkLabel: 'Junior vouchers - up to $200',
  roundLabel: 'Round 11',
  startLabel: '15 September',
  endLabel: '10 am on 13 October 2026',
  eligibilityUrl: 'https://www.getactive.vic.gov.au/vouchers/',
  applicationDetailsUrl: 'https://www.getactive.vic.gov.au/vouchers/apply-for-vouchers/',
} as const satisfies HomePromotionWindow & Record<string, string>;

export function isPromotionActive(promotion: HomePromotionWindow, now: number = Date.now()): boolean {
  return now >= Date.parse(promotion.startsAt) && now < Date.parse(promotion.endsAt);
}

export type JuniorGetActiveVouchers = {
  startsAt: string;
  endsAt: string;
  anchorId: string;
  heroLinkLabel: string;
  roundLabel: string;
  startLabel: string;
  endLabel: string;
  eligibilityUrl: string;
  applicationDetailsUrl: string;
};

/**
 * The Get Active vouchers promotion as edited in /admin/promotions, or null
 * while it is hidden or outside its dates. Without a CMS row (table missing
 * or row absent) the hardcoded JUNIOR_GET_ACTIVE_VOUCHERS values are used,
 * gated by the same dates as isPromotionActive.
 */
export async function getJuniorGetActiveVouchers(now: number = Date.now()): Promise<JuniorGetActiveVouchers | null> {
  const fallback: JuniorGetActiveVouchers = { ...JUNIOR_GET_ACTIVE_VOUCHERS };
  const lookup = await loadSitePromotions();
  return resolvePromotion(lookup, fallback.anchorId, now, { value: fallback, live: isPromotionActive(fallback, now) }, (row) => ({
    startsAt: row.starts_at || fallback.startsAt,
    endsAt: row.ends_at || fallback.endsAt,
    anchorId: fallback.anchorId,
    heroLinkLabel: detailString(row, 'heroLinkLabel', fallback.heroLinkLabel),
    roundLabel: detailString(row, 'roundLabel', fallback.roundLabel),
    startLabel: detailString(row, 'startLabel', fallback.startLabel),
    endLabel: detailString(row, 'endLabel', fallback.endLabel),
    eligibilityUrl: normalisePublicLinkUrl(row.link_url) ?? fallback.eligibilityUrl,
    applicationDetailsUrl: normalisePublicLinkUrl(detailString(row, 'applicationDetailsUrl', '')) ?? fallback.applicationDetailsUrl,
  }));
}
