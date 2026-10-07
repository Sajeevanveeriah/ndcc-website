'use client';

import { useEffect, useState } from 'react';
import TeamSheetsPanel from './TeamSheetsPanel';
import WinnersPanel from './WinnersPanel';

const TABS = [
  { key: 'team-sheets', label: 'Team sheets' },
  { key: 'winners', label: 'Winners' },
] as const;
type Tab = (typeof TABS)[number]['key'];

export default function MatchDayAdminPage() {
  const [tab, setTab] = useState<Tab>('team-sheets');
  // Deep links from the dashboard (?tab=winners) open the right tab.
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('tab');
    if (value === 'winners' || value === 'team-sheets') setTab(value);
  }, []);
  function choose(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href); url.searchParams.set('tab', next); window.history.replaceState(null, '', url);
  }
  return <div className="space-y-6">
    <div>
      <h1 className="font-display text-2xl font-bold text-content-primary">Team sheets &amp; winners</h1>
      <p className="mt-2 text-content-muted">Weekly team sheets, player sponsor awards, Dino Lotto and other winners. Match reports stay under <a className="underline" href="/admin/publications">Publications</a>.</p>
    </div>
    <div role="tablist" aria-label="Team sheets and winners" className="flex gap-2 border-b border-edge-subtle">
      {TABS.map((item) => <button key={item.key} type="button" role="tab" id={`tab-${item.key}`} aria-controls={`panel-${item.key}`} aria-selected={tab === item.key} onClick={() => choose(item.key)}
        className={`-mb-px min-h-11 border-b-2 px-4 font-semibold ${tab === item.key ? 'border-maroon-700 text-content-primary' : 'border-transparent text-content-muted hover:text-content-primary'}`}>{item.label}</button>)}
    </div>
    <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
      {tab === 'team-sheets' ? <TeamSheetsPanel /> : <WinnersPanel />}
    </div>
  </div>;
}
