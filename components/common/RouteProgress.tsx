'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const TRICKLE_INTERVAL_MS = 350;
const FINISH_HIDE_DELAY_MS = 250;
// If a navigation never completes (aborted, failed prefetch), don't leave the
// bar hanging forever.
const SAFETY_TIMEOUT_MS = 8_000;

/**
 * Slim brand-coloured progress bar at the top of the viewport during route
 * changes. Starts on same-origin link clicks and back/forward navigation,
 * completes when the pathname or search params actually change. Width is
 * animated with a plain CSS transition, so the global
 * prefers-reduced-motion rule in globals.css neutralises the motion.
 */
export default function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const trickleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (trickleTimer.current) clearInterval(trickleTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    trickleTimer.current = null;
    hideTimer.current = null;
    safetyTimer.current = null;
  }, []);

  const finish = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    clearTimers();
    setProgress(100);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, FINISH_HIDE_DELAY_MS);
  }, [clearTimers]);

  const start = useCallback(() => {
    clearTimers();
    activeRef.current = true;
    setVisible(true);
    setProgress(12);
    trickleTimer.current = setInterval(() => {
      setProgress((current) => (current >= 85 ? current : current + (85 - current) * 0.18));
    }, TRICKLE_INTERVAL_MS);
    safetyTimer.current = setTimeout(finish, SAFETY_TIMEOUT_MS);
  }, [clearTimers, finish]);

  // The route actually changed: complete the bar.
  useEffect(() => {
    finish();
  }, [pathname, searchParams, finish]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!anchor || anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href');
      if (!href) return;
      let destination: URL;
      try {
        destination = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (destination.origin !== window.location.origin) return;
      // Same-page hash jumps and links to the exact current URL don't
      // trigger a route change, so the bar would never complete.
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      ) {
        return;
      }
      start();
    };

    const handlePopState = () => start();

    document.addEventListener('click', handleClick, true);
    window.addEventListener('popstate', handlePopState);
    return () => {
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('popstate', handlePopState);
      clearTimers();
    };
  }, [start, clearTimers]);

  if (!visible) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[60]">
      <div
        className="h-[3px] rounded-r-full bg-gradient-to-r from-maroon-800 via-maroon-600 to-sky_accent shadow-[0_1px_6px_rgba(128,0,0,0.45)] transition-[width] duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
