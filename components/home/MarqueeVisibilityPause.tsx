'use client';

import { useEffect } from 'react';

// Pauses every homepage marquee while the tab is hidden by toggling a body
// class the CSS reads. Renders nothing.
export default function MarqueeVisibilityPause() {
  useEffect(() => {
    const sync = () => document.body.classList.toggle('marquee-page-hidden', document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      document.body.classList.remove('marquee-page-hidden');
    };
  }, []);
  return null;
}
