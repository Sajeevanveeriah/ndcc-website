// Merchandise orders send an idempotency key so a retry returns the original
// order instead of a duplicate. The key is remembered in localStorage (shared
// by every tab on this browser) so the same order submitted from a second tab
// reuses it too. A tab that has already completed an attempt starts a fresh
// one for its next order, so a deliberate repeat order is never swallowed.

export const MERCH_ATTEMPT_STORAGE_NAME = 'ndcc-merch-order-attempt';
export const MERCH_ATTEMPT_TTL_MS = 30 * 60 * 1000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type StoredAttempt = { signature: string; key: string; at: number; tab: string; done?: boolean };

/** What identifies "the same order" across tabs: the payload without per-page anti-spam fields. */
export function merchAttemptSignature(payload: Record<string, unknown>): string {
  const { submitted_at: _submittedAt, hp_field: _hpField, ...order } = payload;
  void _submittedAt; void _hpField;
  return JSON.stringify(order);
}

function read(storage: StorageLike | null): StoredAttempt | null {
  try {
    const value = JSON.parse(storage?.getItem(MERCH_ATTEMPT_STORAGE_NAME) || 'null');
    if (value && typeof value.signature === 'string' && typeof value.key === 'string'
      && typeof value.at === 'number' && typeof value.tab === 'string') return value;
  } catch { /* unreadable: start fresh */ }
  return null;
}

function write(storage: StorageLike | null, value: StoredAttempt) {
  try { storage?.setItem(MERCH_ATTEMPT_STORAGE_NAME, JSON.stringify(value)); } catch { /* storage optional */ }
}

/**
 * The key for this order: the remembered one when the same order was started
 * within the last 30 minutes (by any tab, or by another tab after it finished),
 * otherwise a new key, remembered for the other tabs.
 */
export function merchAttemptKey(storage: StorageLike | null, signature: string, tab: string, now: number, newKey: () => string): string {
  const stored = read(storage);
  if (stored && stored.signature === signature && now - stored.at < MERCH_ATTEMPT_TTL_MS
    && !(stored.done && stored.tab === tab)) return stored.key;
  const key = newKey();
  if (key) write(storage, { signature, key, at: now, tab });
  return key;
}

/** The order was created: other tabs keep replaying it; this tab starts fresh next time. */
export function completeMerchAttempt(storage: StorageLike | null, key: string, tab: string) {
  const stored = read(storage);
  if (stored?.key === key) write(storage, { ...stored, tab, done: true });
}

/** The server refused to replay this key (changed or removed order): stop reusing it. */
export function forgetMerchAttempt(storage: StorageLike | null, key: string) {
  try { if (read(storage)?.key === key) storage?.removeItem(MERCH_ATTEMPT_STORAGE_NAME); } catch { /* storage optional */ }
}
