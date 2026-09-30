'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Wrench } from 'lucide-react';
import { maintenanceBannerText, maintenancePhase, nextMaintenanceChange, type MaintenanceBanner as MaintenanceBannerData } from '@/lib/maintenance-banner';

type BannerText = { heading: string; detail: string } | null;

const MaintenanceTextContext = createContext<BannerText>(null);

const HEIGHT_VAR = '--site-banner-h';

/**
 * Holds the site-wide maintenance notice for every page. The first render
 * uses the time the server read the setting, so it matches the server HTML;
 * the live clock then takes over, switching to "in progress" at the start
 * time and removing the notice at the end time.
 */
export function MaintenanceBannerProvider({ banner, children }: { banner: MaintenanceBannerData | null; children: React.ReactNode }) {
  const [phase, setPhase] = useState(() => (banner ? maintenancePhase(banner, banner.checkedAt) : 'ended'));

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
  return <MaintenanceTextContext.Provider value={text}>{children}</MaintenanceTextContext.Provider>;
}

function Notice({ text, hidden = false, id }: { text: NonNullable<BannerText>; hidden?: boolean; id?: string }) {
  return (
    <div
      id={id}
      {...(hidden ? { 'aria-hidden': true } : { role: 'region', 'aria-label': 'Maintenance notice' })}
      className={`border-b border-amber-300 bg-amber-50 px-4 py-2 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50 sm:px-6 lg:px-8${hidden ? ' invisible' : ''}`}
    >
      <p className="mx-auto flex max-w-7xl items-start justify-center gap-2 text-center text-sm font-body leading-snug">
        <Wrench className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span><strong className="font-semibold">{text.heading}.</strong> {text.detail}</span>
      </p>
    </div>
  );
}

/**
 * The visible notice. In the fixed site header it also publishes its height
 * for sticky elements; `standalone` places it in the normal flow of a
 * fullscreen screen that covers the header (the raffle draw display).
 */
export default function MaintenanceBanner({ standalone = false }: { standalone?: boolean }) {
  const text = useContext(MaintenanceTextContext);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (standalone) return;
    const root = document.documentElement;
    const element = ref.current;
    if (!text || !element) { root.style.setProperty(HEIGHT_VAR, '0px'); return; }
    const update = () => root.style.setProperty(HEIGHT_VAR, `${Math.ceil(element.getBoundingClientRect().height)}px`);
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => { observer?.disconnect(); root.style.setProperty(HEIGHT_VAR, '0px'); };
  }, [text, standalone]);

  if (!text) return null;
  return <div ref={ref}><Notice text={text} id={standalone ? undefined : 'site-maintenance-banner'} /></div>;
}

/**
 * An invisible copy at the top of the page content. It lays out exactly like
 * the notice in the fixed header, so the content always starts below it,
 * from the first paint, without measuring anything.
 */
export function MaintenanceBannerSpacer() {
  const text = useContext(MaintenanceTextContext);
  return text ? <Notice text={text} hidden /> : null;
}
