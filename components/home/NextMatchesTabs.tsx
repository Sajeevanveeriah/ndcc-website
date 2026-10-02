'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export type MatchTab = { key: string; label: string; panel: ReactNode };

/**
 * Men's / Women's / Juniors switcher for the home "Next matches" card. The
 * rows are rendered on the server and passed in; every panel stays in the
 * HTML (inactive ones are `hidden`), so nothing is lost without JavaScript
 * beyond the switch itself. Arrow keys, Home and End move between tabs.
 */
export default function NextMatchesTabs({ tabs, label = 'Competition' }: { tabs: MatchTab[]; label?: string }) {
  const id = useId();
  const [active, setActive] = useState(tabs[0]?.key ?? '');
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  if (tabs.length === 0) return null;
  const select = (index: number) => {
    const tab = tabs[(index + tabs.length) % tabs.length];
    setActive(tab.key);
    buttons.current[(index + tabs.length) % tabs.length]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    select(moves[event.key]);
  };
  return (
    <>
      {tabs.length > 1 && (
        <div className="nd-seg mb-4" role="tablist" aria-label={label}>
          {tabs.map((tab, index) => (
            <button
              key={tab.key}
              ref={(node) => { buttons.current[index] = node; }}
              type="button"
              role="tab"
              id={`${id}-tab-${tab.key}`}
              aria-selected={active === tab.key}
              aria-controls={`${id}-panel-${tab.key}`}
              tabIndex={active === tab.key ? 0 : -1}
              onClick={() => setActive(tab.key)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      {tabs.map((tab) => (
        <div
          key={tab.key}
          id={`${id}-panel-${tab.key}`}
          role={tabs.length > 1 ? 'tabpanel' : undefined}
          aria-labelledby={tabs.length > 1 ? `${id}-tab-${tab.key}` : undefined}
          hidden={active !== tab.key}
        >
          {tab.panel}
        </div>
      ))}
    </>
  );
}
