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
