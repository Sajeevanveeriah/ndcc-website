'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_PREFIX = 'ndcc-admin-draft:';
const DRAFT_VERSION = 1;
const AUTOSAVE_DELAY_MS = 1_000;
const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Fired by InactivityGuard just before an automatic sign-out. */
export const ADMIN_BEFORE_LOGOUT_EVENT = 'ndcc-admin-before-logout';

type StoredDraft<T> = { version: number; savedAt: string; value: T };

// localStorage can be unavailable (private mode, blocked storage, quota), so
// every access is wrapped and failures simply disable draft recovery.
function readDraft<T>(key: string): StoredDraft<T> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (parsed?.version !== DRAFT_VERSION || typeof parsed.savedAt !== 'string') return null;
    if (Date.now() - Date.parse(parsed.savedAt) > DRAFT_MAX_AGE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeDraft<T>(key: string, value: T) {
  try {
    const draft: StoredDraft<T> = { version: DRAFT_VERSION, savedAt: new Date().toISOString(), value };
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Storage full or blocked: keep editing without local recovery.
  }
}

function removeDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
}

function serialise(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

/**
 * Keeps a local draft of an admin editor so work survives a closed tab,
 * crash or inactivity sign-out.
 *
 * - `editor` + `recordId` form the storage key (`recordId` null = new record).
 * - While `active` (editor open) and the value differs from what was loaded,
 *   the value is saved to localStorage after a short debounce, and flushed
 *   immediately on page hide and before an inactivity sign-out.
 * - When the editor opens and a stored draft differs from the loaded value,
 *   `pendingDraft` is set so the page can offer Restore / Discard.
 * - Call `clearDraft()` after a successful save.
 */
export function useDraftAutosave<T>({ editor, recordId, value, active }: {
  editor: string;
  recordId: string | null | undefined;
  value: T;
  active: boolean;
}) {
  const key = `${STORAGE_PREFIX}${editor}:${recordId || 'new'}`;
  const serialised = serialise(value);
  // Serialised value the editor was opened with (or last saved). Kept in
  // state so `dirty` re-renders; mirrored in a ref for event handlers.
  const [baseline, setBaseline] = useState<string | null>(null);
  const baselineRef = useRef<string | null>(null);
  baselineRef.current = baseline;
  const [epoch, setEpoch] = useState(0);
  const latestRef = useRef({ key, value, serialised });
  latestRef.current = { key, value, serialised };
  const [pendingDraft, setPendingDraft] = useState<StoredDraft<T> | null>(null);
  const pendingRef = useRef(false);
  pendingRef.current = pendingDraft !== null;

  // Capture the loaded value as the baseline each time an editor opens,
  // switches record or is saved (epoch), and look for a recoverable draft.
  useEffect(() => {
    if (!active) {
      baselineRef.current = null;
      setBaseline(null);
      setPendingDraft(null);
      return;
    }
    baselineRef.current = latestRef.current.serialised;
    setBaseline(latestRef.current.serialised);
    const stored = readDraft<T>(key);
    if (stored && serialise(stored.value) !== latestRef.current.serialised) setPendingDraft(stored);
    else setPendingDraft(null);
  }, [active, key, epoch]);

  const dirty = active && baseline !== null && serialised !== baseline;

  const flush = useCallback(() => {
    const { key: currentKey, value: currentValue, serialised: currentSerialised } = latestRef.current;
    if (!baselineRef.current || pendingRef.current || currentSerialised === baselineRef.current) return;
    writeDraft(currentKey, currentValue);
  }, []);

  // Debounced autosave while dirty. Suspended until a pending draft is
  // restored or discarded so it is never silently overwritten.
  useEffect(() => {
    if (!dirty || pendingDraft) return;
    const timer = window.setTimeout(flush, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [dirty, pendingDraft, serialised, flush]);

  useEffect(() => {
    if (!active) return;
    window.addEventListener('pagehide', flush);
    window.addEventListener(ADMIN_BEFORE_LOGOUT_EVENT, flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener(ADMIN_BEFORE_LOGOUT_EVENT, flush);
    };
  }, [active, flush]);

  /** Returns the stored draft value for the page to apply to its form state. */
  const restoreDraft = useCallback((): T | null => {
    const draft = pendingDraft;
    setPendingDraft(null);
    return draft ? draft.value : null;
  }, [pendingDraft]);

  const discardDraft = useCallback(() => {
    removeDraft(key);
    setPendingDraft(null);
  }, [key]);

  /** Call after a successful save: removes the draft and re-baselines on the next render. */
  const clearDraft = useCallback(() => {
    removeDraft(key);
    baselineRef.current = null;
    setBaseline(null);
    setPendingDraft(null);
    setEpoch((value) => value + 1);
  }, [key]);

  return { dirty, pendingDraft, restoreDraft, discardDraft, clearDraft };
}

export default useDraftAutosave;
