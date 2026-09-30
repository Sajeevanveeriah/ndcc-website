// The kitchen page's order key (the meal draft token) is remembered for the
// whole browser, not just the tab, so a customer who comes back in a new tab,
// for example after a failed card payment, resumes their existing order instead
// of starting a duplicate. Only the random key and when it was last used are
// stored here, never contact details (those come back from the server with the
// order), and the key is forgotten after 12 hours so a shared device does not
// keep showing someone else's order.

export const MEAL_ORDER_STORAGE_NAME = 'ndcc-meal-order-v1';
export const MEAL_ORDER_KEY_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The remembered key, or null when missing, malformed or older than the maximum age. */
export function parseStoredOrderKey(raw: string | null | undefined, nowMs: number): string | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { token?: unknown; savedAt?: unknown };
    if (typeof value?.token !== 'string' || !UUID_V4.test(value.token)) return null;
    const savedAt = Number(value.savedAt);
    if (!Number.isFinite(savedAt) || savedAt > nowMs + 60_000 || nowMs - savedAt > MEAL_ORDER_KEY_MAX_AGE_MS) return null;
    return value.token;
  } catch {
    return null;
  }
}

export function serialiseOrderKey(token: string, nowMs: number): string {
  return JSON.stringify({ token, savedAt: nowMs });
}

/** True when the stored value still names this order key, whatever its age. */
export function storedOrderKeyIs(raw: string | null | undefined, token: string): boolean {
  if (!raw) return false;
  try { return (JSON.parse(raw) as { token?: unknown })?.token === token; } catch { return false; }
}

/** An order for an earlier Thursday is finished with; the page starts a fresh order instead. */
export function isPastService(orderServiceDate: unknown, currentServiceDate: string): boolean {
  return typeof orderServiceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(orderServiceDate) && orderServiceDate < currentServiceDate;
}
