'use client';

import { useEffect, useRef, useState } from 'react';
import { Wrench } from 'lucide-react';
import { maintenanceBannerText, maintenancePhase, nextMaintenanceChange, type MaintenanceBanner as MaintenanceBannerData } from '@/lib/maintenance-banner';

const HEIGHT_VAR = '--site-banner-h';

/**
 * Site-wide maintenance notice at the top of the fixed header. The first
 * render uses the time the server read the setting, so it matches the server
 * HTML; the live clock then takes over and the notice switches to "in
 * progress" at the start time and removes itself at the end time.
 */
export default function MaintenanceBanner({ banner }: { banner: MaintenanceBannerData | null }) {
  const [phase, setPhase] = useState(() => (banner ? maintenancePhase(banner, banner.checkedAt) : 'ended'));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!banner) { setPhase('ended'); return; }
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const now = Date.now();
      setPhase(maintenancePhase(banner, now));
      const next = nextMaintenanceChange(banner, now);
      // Cap long waits to avoid the browser's signed 32-bit timeout overflow.
      if (next !== null) timer = setTimeout(refresh, Math.min(Math.max(next - now, 0) + 250, 86_400_000));
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [banner]);

  const text = banner ? maintenanceBannerText(banner, phase) : null;

  // The page content is offset by the header height; publish this notice's
  // exact height so nothing sits underneath it, and clear it when hidden.
  useEffect(() => {
    const root = document.documentElement;
    const element = ref.current;
    if (!text || !element) { root.style.setProperty(HEIGHT_VAR, '0px'); return; }
    const update = () => root.style.setProperty(HEIGHT_VAR, `${Math.ceil(element.getBoundingClientRect().height)}px`);
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => { observer?.disconnect(); root.style.setProperty(HEIGHT_VAR, '0px'); };
  }, [text]);

  if (!text) return null;
  return (
    <div
      ref={ref}
      id="site-maintenance-banner"
      role="region"
      aria-label="Maintenance notice"
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50 sm:px-6 lg:px-8"
    >
      <p className="mx-auto flex max-w-7xl items-start justify-center gap-2 text-center text-sm font-body leading-snug">
        <Wrench className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span><strong className="font-semibold">{text.heading}.</strong> {text.detail}</span>
      </p>
    </div>
  );
}
