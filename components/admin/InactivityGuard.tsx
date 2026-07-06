'use client';

import { useEffect, useRef, useState } from 'react';

const INACTIVITY_LIMIT_MS = 10 * 60 * 1000;
const WARNING_AT_MS = 9 * 60 * 1000;
const SERVER_PING_INTERVAL_MS = 4 * 60 * 1000;

/**
 * Signs an admin out after 10 minutes of inactivity, with a warning (and an
 * "extend session" action) from the 9-minute mark. Activity = pointer, keyboard,
 * scroll or window focus. While the warning is showing, only the explicit
 * "Stay signed in" button extends the session so a stray mouse move cannot
 * silently dismiss it. Active use also pings the session endpoint periodically
 * so the server-side idle window (enforced independently) stays fresh.
 */
export default function InactivityGuard({ onLogout }: { onLogout: () => void }) {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const lastActivityRef = useRef(Date.now());
  const lastServerPingRef = useRef(Date.now());
  const warningRef = useRef(false);
  const loggedOutRef = useRef(false);
  const extendButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    warningRef.current = showWarning;
    if (showWarning) extendButtonRef.current?.focus();
  }, [showWarning]);

  useEffect(() => {
    const markActivity = () => {
      if (warningRef.current || loggedOutRef.current) return;
      lastActivityRef.current = Date.now();
      if (Date.now() - lastServerPingRef.current > SERVER_PING_INTERVAL_MS) {
        lastServerPingRef.current = Date.now();
        // Keep the server-side idle window fresh during long form edits that
        // don't otherwise touch an admin API.
        fetch('/api/admin/auth/session', { cache: 'no-store', credentials: 'include' }).catch(() => undefined);
      }
    };

    const events: Array<[keyof WindowEventMap, AddEventListenerOptions | boolean]> = [
      ['pointerdown', true],
      ['pointermove', true],
      ['keydown', true],
      ['scroll', true],
      ['focus', false],
    ];
    events.forEach(([name, options]) => window.addEventListener(name, markActivity, options));

    const interval = setInterval(() => {
      if (loggedOutRef.current) return;
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_LIMIT_MS) {
        loggedOutRef.current = true;
        setShowWarning(false);
        onLogout();
        return;
      }
      if (elapsed >= WARNING_AT_MS) {
        setSecondsLeft(Math.max(0, Math.ceil((INACTIVITY_LIMIT_MS - elapsed) / 1000)));
        setShowWarning(true);
      }
    }, 1000);

    return () => {
      events.forEach(([name, options]) => window.removeEventListener(name, markActivity, options));
      clearInterval(interval);
    };
  }, [onLogout]);

  const extendSession = () => {
    lastActivityRef.current = Date.now();
    lastServerPingRef.current = Date.now();
    setShowWarning(false);
    fetch('/api/admin/auth/session', { cache: 'no-store', credentials: 'include' }).catch(() => undefined);
  };

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="inactivity-warning-title"
        aria-describedby="inactivity-warning-body"
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800"
      >
        <h2 id="inactivity-warning-title" className="text-lg font-display font-bold text-gray-900 dark:text-slate-100">
          Still there?
        </h2>
        <p id="inactivity-warning-body" className="mt-2 text-sm font-body text-gray-600 dark:text-slate-300">
          For security you will be signed out in{' '}
          <span className="font-semibold text-maroon-700 dark:text-maroon-200">{secondsLeft} seconds</span> due to
          inactivity.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            ref={extendButtonRef}
            type="button"
            onClick={extendSession}
            className="flex-1 rounded-lg bg-maroon-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-maroon-800 focus-ring"
          >
            Stay signed in
          </button>
          <button
            type="button"
            onClick={() => {
              loggedOutRef.current = true;
              setShowWarning(false);
              onLogout();
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 focus-ring dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Sign out now
          </button>
        </div>
      </div>
    </div>
  );
}
