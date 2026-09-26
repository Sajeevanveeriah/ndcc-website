'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export type FixturesTab = { id: string; label: string; content: ReactNode };

/**
 * Accessible team filter for /fixtures (WAI-ARIA tabs pattern: arrow keys,
 * Home/End, roving tabindex). Panel content is rendered on the server and
 * passed in, so every fixture is in the HTML; this island only toggles which
 * panel is visible. The first tab ("All teams") is shown before hydration.
 */
export default function FixturesTeamTabs({ tabs, label }: { tabs: FixturesTab[]; label: string }) {
  const [active, setActive] = useState(0);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  function select(index: number) {
    const next = (index + tabs.length) % tabs.length;
    setActive(next);
    buttons.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); select(index + 1); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); select(index - 1); }
    else if (event.key === 'Home') { event.preventDefault(); select(0); }
    else if (event.key === 'End') { event.preventDefault(); select(tabs.length - 1); }
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab, index) => {
          const selected = index === active;
          return (
            <button
              key={tab.id}
              ref={(element) => { buttons.current[index] = element; }}
              type="button"
              role="tab"
              id={`fixtures-tab-${index}`}
              aria-selected={selected}
              aria-controls={`fixtures-panel-${index}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`min-h-[44px] rounded-lg border px-4 py-2 font-body text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${selected
                ? 'border-maroon-700 bg-maroon-700 text-white dark:border-maroon-300 dark:bg-maroon-300 dark:text-maroon-950'
                : 'border-edge-strong bg-surface-card text-content-primary hover:border-maroon-700 dark:hover:border-maroon-300'}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`fixtures-panel-${index}`}
          aria-labelledby={`fixtures-tab-${index}`}
          hidden={index !== active}
          tabIndex={0}
          className="space-y-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-500 focus-visible:ring-offset-4 rounded-lg"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
