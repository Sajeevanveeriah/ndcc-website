// Merchandise orders send an idempotency key so a retry returns the original
// order instead of a duplicate. The key is shared through localStorage so the
// same order submitted again from another open tab reuses it too.
//
// Only a SHA-256 digest of the order is stored (never names, emails or the
// cart), and the record is removed once it is older than 30 minutes.
//
// A completed attempt is replayed only to pages that were already open before
// it completed (a second tab still holding the same order). A page loaded
// afterwards (a reload or a new visit), or the page that completed it, starts
// a fresh attempt, so a deliberate repeat order is never swallowed.

export const MERCH_ATTEMPT_STORAGE_NAME = 'ndcc-merch-order-attempt';
export const MERCH_ATTEMPT_TTL_MS = 30 * 60 * 1000;
const LOCK_NAME = 'ndcc-merch-order-attempt';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type StoredAttempt = { digest: string; key: string; at: number; completedAt?: number };

/** What identifies "the same order" across tabs: the payload without per-page anti-spam fields. */
export function merchAttemptSignature(payload: Record<string, unknown>): string {
  const { submitted_at: _submittedAt, hp_field: _hpField, ...order } = payload;
  void _submittedAt; void _hpField;
  return JSON.stringify(order);
}

/** SHA-256 hex of the signature, or null where Web Crypto is unavailable (then nothing is shared). */
export async function merchAttemptDigest(signature: string): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    const bytes = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(signature)));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

function remove(storage: StorageLike | null) {
  try { storage?.removeItem(MERCH_ATTEMPT_STORAGE_NAME); } catch { /* storage optional */ }
}

/** The stored attempt while it is fresh; an expired or unreadable record is removed. */
function read(storage: StorageLike | null, now: number): StoredAttempt | null {
  let raw: string | null = null;
  try { raw = storage?.getItem(MERCH_ATTEMPT_STORAGE_NAME) ?? null; } catch { return null; }
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (value && typeof value.digest === 'string' && typeof value.key === 'string' && typeof value.at === 'number'
      && (value.completedAt === undefined || typeof value.completedAt === 'number')
      && now - value.at < MERCH_ATTEMPT_TTL_MS) return value;
  } catch { /* unreadable */ }
  remove(storage);
  return null;
}

function write(storage: StorageLike | null, value: StoredAttempt) {
  try { storage?.setItem(MERCH_ATTEMPT_STORAGE_NAME, JSON.stringify(value)); } catch { /* storage optional */ }
}

/** Remove an expired record (call on page load). */
export function pruneMerchAttempt(storage: StorageLike | null, now: number) {
  read(storage, now);
}

/**
 * The key for this order. Reuses the stored key when the same order is in
 * flight in another tab, or completed after this page loaded and not by this
 * page; otherwise creates and stores a new key.
 */
export function merchAttemptKey(storage: StorageLike | null, options: {
  digest: string | null; now: number; pageLoadedAt: number; completedHere: ReadonlySet<string>; newKey: () => string;
}): string {
  const { digest, now, pageLoadedAt, completedHere, newKey } = options;
  if (!digest) return newKey();
  const stored = read(storage, now);
  if (stored && stored.digest === digest && !completedHere.has(stored.key)
    && (stored.completedAt === undefined || stored.completedAt >= pageLoadedAt)) return stored.key;
  const key = newKey();
  if (key) write(storage, { digest, key, at: now });
  return key;
}

/** The order was created (or replayed): note when, so later page loads start fresh. */
export function completeMerchAttempt(storage: StorageLike | null, key: string, now: number) {
  const stored = read(storage, now);
  if (stored?.key === key && stored.completedAt === undefined) write(storage, { ...stored, completedAt: now });
}

/** The server refused to replay this key (changed or removed order): stop reusing it. */
export function forgetMerchAttempt(storage: StorageLike | null, key: string, now: number) {
  if (read(storage, now)?.key === key) remove(storage);
}

/** Run a read-modify-write under a cross-tab Web Lock where supported, so two tabs cannot race. */
export async function withMerchAttemptLock<T>(task: () => T): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (!locks?.request) return task();
  try {
    return await locks.request(LOCK_NAME, async () => task());
  } catch {
    return task();
  }
}
