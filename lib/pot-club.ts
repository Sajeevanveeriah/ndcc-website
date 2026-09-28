// Pot Club product selection. The public page offers the membership plan
// whose product_code matches the code chosen in /admin/promotions
// (club_settings.pot_club_product_code); the original code is the fallback.
// No imports, so tests can load it directly.

export const DEFAULT_POT_CLUB_PRODUCT_CODE = 'pot_club_2026_27';
const PRODUCT_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;

export function isValidProductCode(value: unknown): value is string {
  return typeof value === 'string' && PRODUCT_CODE_PATTERN.test(value);
}

export function resolvePotClubProductCode(value: unknown): string {
  return isValidProductCode(value) ? value : DEFAULT_POT_CLUB_PRODUCT_CODE;
}

/** Whole dollars without decimals (AUD 100), otherwise two decimals (AUD 12.50). */
export function formatPotClubPrice(price: number): string {
  return Number.isInteger(price) ? `AUD ${price}` : `AUD ${price.toFixed(2)}`;
}

type PotClubOrderItem = { name?: unknown; product_code?: unknown; product_kind?: unknown; size?: unknown };

// Pot Club is sold as a membership plan, so its orders share the
// 'membership' category with genuine social memberships. Orders mark the
// CMS-selected Pot Club plan with product_kind 'pot_club'; older orders are
// recognised by the original product code or the "Pot Club" plan name.
function isPotClubItem(item: PotClubOrderItem) {
  if (item.product_kind === 'pot_club') return true;
  const code = typeof item.product_code === 'string' ? item.product_code.trim() : '';
  return code.startsWith('pot_club') || /^pot club\b/i.test(String(item.name ?? '').trim());
}

/** The Pot Club plan name ("Pot Club 2026/2027") of a membership order, or null for any other order. */
export function potClubOrderName(category: unknown, items: unknown): string | null {
  if (String(category ?? '') !== 'membership' || !Array.isArray(items)) return null;
  const potClub = (items as PotClubOrderItem[]).find((item) => item && typeof item === 'object' && item.size === 'membership' && isPotClubItem(item));
  if (!potClub) return null;
  return String(potClub.name ?? '').trim().slice(0, 55) || 'Pot Club';
}
