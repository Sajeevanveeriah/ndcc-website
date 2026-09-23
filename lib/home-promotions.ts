// Time-limited promotions shown on the home page. Dates and labels live here
// so a promotion can be updated or retired in one place; the page renders a
// promotion only while `isPromotionActive` is true (evaluated at render /
// ISR regeneration time).

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
