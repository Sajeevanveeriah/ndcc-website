'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// Cap slightly above the CSS animation length so the class always clears even
// if animationend never fires (e.g. the tab is hidden mid-animation).
const SETTLE_FALLBACK_MS = 600;

/**
 * Post-commit page-enter feedback: once the router has committed a new
 * pathname, the freshly rendered content settles in via a short CSS class
 * animation on the existing <main> landmark (see .route-settle in
 * globals.css). Deliberate limits:
 *
 * - Runs only after client-side navigations — never the initial load, so the
 *   server paint, hydration and LCP are untouched.
 * - Never animates exit and never delays route commitment; the new route is
 *   already on screen when the class is applied.
 * - Keys off pathname only, so in-page filter/search-param changes and
 *   hash jumps do not re-run it.
 * - Reduced motion skips it entirely (the global reduced-motion rule also
 *   collapses the animation as a second guard).
 */
export default function RouteSettle() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const main = document.getElementById('main-content');
    if (!main) return;

    // Restart cleanly on rapid successive navigations.
    main.classList.remove('route-settle');
    void main.offsetWidth;
    main.classList.add('route-settle');

    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => {
      main.classList.remove('route-settle');
      main.removeEventListener('animationend', handleEnd);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
    // animationend bubbles from child entrances (e.g. page-hero titles), so
    // only the main element's own animation may clear the class.
    const handleEnd = (event: AnimationEvent) => {
      if (event.target === main) clear();
    };
    main.addEventListener('animationend', handleEnd);
    fallbackTimer = setTimeout(clear, SETTLE_FALLBACK_MS);
    return clear;
  }, [pathname]);

  return null;
}
