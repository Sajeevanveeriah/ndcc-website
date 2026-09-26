'use client';

import { useEffect } from 'react';

const PENDING = '[data-reveal]:not([data-revealed]), [data-reveal-stagger]:not([data-revealed])';

/**
 * Drives the subtle scroll settle for ScrollReveal blocks. Anything already
 * on screen when it starts is marked revealed first, so nothing visible ever
 * blinks out. The page is re-checked on every scroll frame and whenever new
 * content streams in, and a block is revealed once its top edge enters the
 * viewport or has been scrolled past, so fast scrolls, keyboard jumps, anchor
 * links and streamed sections can never leave a block hidden. The marker is
 * an attribute React does not manage, so re-renders cannot clear it.
 */
export default function RevealObserver() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches || typeof MutationObserver === 'undefined') return;

    const revealVisible = () => {
      const limit = window.innerHeight * 0.94;
      document.querySelectorAll(PENDING).forEach((element) => {
        if (element.getBoundingClientRect().top < limit) element.setAttribute('data-revealed', '');
      });
    };
    const revealAll = () => document.querySelectorAll(PENDING).forEach((element) => element.setAttribute('data-revealed', ''));

    // Mark what is already on screen before the effect can hide anything.
    revealVisible();
    root.classList.add('reveal-on');

    let frame = 0;
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; revealVisible(); }); };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    // Streamed sections and client navigation: new blocks already in view
    // are marked in the same task, before the browser paints them hidden.
    const mo = new MutationObserver(revealVisible);
    mo.observe(document.body, { childList: true, subtree: true });

    const disable = () => {
      if (!reduced.matches) return;
      root.classList.remove('reveal-on');
      revealAll();
    };
    reduced.addEventListener('change', disable);
    window.addEventListener('beforeprint', revealAll);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      mo.disconnect();
      reduced.removeEventListener('change', disable);
      window.removeEventListener('beforeprint', revealAll);
      root.classList.remove('reveal-on');
      revealAll();
    };
  }, []);
  return null;
}
