// Merchandise orders send an idempotency key so a retry returns the original
// order instead of a duplicate. The key is shared through localStorage so the
// same order submitted again from another open tab reuses it too.
//
// Only SHA-256 digests of orders are stored (never names, emails or the
// cart), each with its key; records older than 30 minutes are removed. Every
// read-modify-write runs under one cross-tab Web Lock where supported.
//
// A completed attempt is replayed only to pages that were already open before
// it completed (a second tab still holding the same order). A page loaded
// afterwards (a reload or a new visit), or the page that completed it, starts
// a fresh attempt, so a deliberate repeat order is never swallowed.

export const MERCH_ATTEMPT_STORAGE_NAME = 'ndcc-merch-order-attempt';
export const MERCH_ATTEMPT_TTL_MS = 30 * 60 * 1000;
const LOCK_NAME = 'ndcc-merch-order-attempt';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type StoredAttempt = { key: string; at: number; completedAt?: number };
/** Fresh attempts keyed by order digest, so different orders in different tabs never evict each other. */
type StoredAttempts = Record<string, StoredAttempt>;
const MAX_ATTEMPTS = 20;

/**
 * What identifies "the same order" across tabs. Mirrors orderFingerprint in
 * app/api/orders/route.ts (trimmed text, lower-case email, same fields), so
 * two tabs the server would treat as the same order share one key.
 */
export function merchAttemptSignature(payload: Record<string, unknown>): string {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  return JSON.stringify({
    customer_name: text(payload.customer_name),
    customer_email: text(payload.customer_email).toLowerCase(),
    customer_phone: text(payload.customer_phone),
    notes: text(payload.notes),
    items: payload.items,
    total_amount: payload.total_amount,
    payment_method: payload.payment_method,
    merch_window_id: payload.merch_window_id || null,
  });
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

function isAttempt(value: unknown): value is StoredAttempt {
  const attempt = value as StoredAttempt;
  return Boolean(attempt) && typeof attempt.key === 'string' && typeof attempt.at === 'number'
    && (attempt.completedAt === undefined || typeof attempt.completedAt === 'number');
}

/** Fresh attempts only; expired or unreadable entries are dropped. */
function read(storage: StorageLike | null, now: number): StoredAttempts {
  let raw: string | null = null;
  try { raw = storage?.getItem(MERCH_ATTEMPT_STORAGE_NAME) ?? null; } catch { return {}; }
  if (raw === null) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const fresh: StoredAttempts = {};
    for (const [digest, attempt] of Object.entries(value)) {
      if (/^[0-9a-f]{64}$/.test(digest) && isAttempt(attempt) && now - attempt.at < MERCH_ATTEMPT_TTL_MS) fresh[digest] = attempt;
    }
    return fresh;
  } catch { return {}; }
}

function write(storage: StorageLike | null, attempts: StoredAttempts) {
  try {
    const entries = Object.entries(attempts).sort(([, a], [, b]) => b.at - a.at).slice(0, MAX_ATTEMPTS);
    if (entries.length === 0) storage?.removeItem(MERCH_ATTEMPT_STORAGE_NAME);
    else storage?.setItem(MERCH_ATTEMPT_STORAGE_NAME, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* storage optional */ }
}

/** Remove expired records (call on page load). */
export function pruneMerchAttempt(storage: StorageLike | null, now: number) {
  write(storage, read(storage, now));
}

/**
 * The key for this order. Reuses the stored key when the same order is in
 * flight in another tab, or completed after this page loaded and not by this
 * page; otherwise creates and stores a new key for this order.
 */
export function merchAttemptKey(storage: StorageLike | null, options: {
  digest: string | null; now: number; pageLoadedAt: number; completedHere: ReadonlySet<string>; newKey: () => string;
}): string {
  const { digest, now, pageLoadedAt, completedHere, newKey } = options;
  if (!digest) return newKey();
  const attempts = read(storage, now);
  const stored = attempts[digest];
  if (stored && !completedHere.has(stored.key)
    && (stored.completedAt === undefined || stored.completedAt >= pageLoadedAt)) return stored.key;
  const key = newKey();
  if (key) write(storage, { ...attempts, [digest]: { key, at: now } });
  return key;
}

/** The order was created (or replayed): note when, so later page loads start fresh. */
export function completeMerchAttempt(storage: StorageLike | null, key: string, now: number) {
  const attempts = read(storage, now);
  const entry = Object.entries(attempts).find(([, attempt]) => attempt.key === key);
  if (entry && entry[1].completedAt === undefined) write(storage, { ...attempts, [entry[0]]: { ...entry[1], completedAt: now } });
}

/** The server refused to replay this key (changed or removed order): stop reusing it. */
export function forgetMerchAttempt(storage: StorageLike | null, key: string, now: number) {
  const attempts = read(storage, now);
  write(storage, Object.fromEntries(Object.entries(attempts).filter(([, attempt]) => attempt.key !== key)));
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

/**
 * When this visit to the page began. A direct load of the page uses the
 * document's navigation start (so an order completing while it loaded still
 * counts as "before"); a later in-app navigation to it uses the time it
 * mounted, since the document's start time is from an earlier page.
 */
export function merchVisitStartedAt(options: {
  firstMountInDocument: boolean; documentPath: string | null; currentPath: string; timeOrigin: number | null; now: number;
}): number {
  const { firstMountInDocument, documentPath, currentPath, timeOrigin, now } = options;
  return firstMountInDocument && documentPath === currentPath && timeOrigin ? Math.floor(timeOrigin) : now;
}
