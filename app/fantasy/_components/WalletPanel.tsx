'use client';
import { useEffect, useRef, useState } from 'react';
import { fantasyJsonFetch, fantasyBrowserClient } from '@/lib/fantasy-browser';
import { formatDinoDollars } from '@/lib/dino-coach/domain';

type Snapshot = { managerId: string; settings: { budget_dino_dollars: number }; squad: { updated_at: string; budget_used_dino_dollars: number } | null };
export default function WalletPanel({ query, previewRemaining, refreshKey, onExternalChange }: { query: string; refreshKey?: string | null; previewRemaining?: number; onExternalChange?: () => void }) {
 const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
 const [status, setStatus] = useState('Connecting');
 const [error, setError] = useState('');
 const onChange = useRef(onExternalChange); onChange.current = onExternalChange;
 useEffect(() => {
  let active = true; let version: string | undefined; let pending = false;
  let channel: ReturnType<NonNullable<typeof fantasyBrowserClient>['channel']> | undefined;
  const refresh = async () => {
   if (pending) return; pending = true;
   try {
    const data = await fantasyJsonFetch<Snapshot>(`/api/fantasy/squad${query}`);
    if (!active) return;
    if (version && data.squad?.updated_at !== version) onChange.current?.();
    version = data.squad?.updated_at; setSnapshot(data); setError('');
    if (!channel && fantasyBrowserClient) {
     channel = fantasyBrowserClient.channel(`wallet-${data.managerId}-${query}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fantasy_squads', filter: `manager_id=eq.${data.managerId}` }, () => { void refresh(); })
      .subscribe((state) => { if(active) setStatus(state === 'SUBSCRIBED' ? 'Live' : 'Reconnecting - automatic refresh active'); });
    }
   } catch (reason) { if(active) { setError(reason instanceof Error ? reason.message : 'Wallet unavailable'); setStatus('Balance may be out of date'); } }
   finally { pending = false; }
  };
  void refresh();
  const timer = setInterval(() => { if(document.visibilityState === 'visible') void refresh(); }, 15000);
  const focus = () => { void refresh(); }; window.addEventListener('focus',focus);
  return () => { active=false; clearInterval(timer); window.removeEventListener('focus',focus); if(channel && fantasyBrowserClient) void fantasyBrowserClient.removeChannel(channel); };
 }, [query, refreshKey]);
 const budget=Number(snapshot?.settings.budget_dino_dollars || 0); const spent=Number(snapshot?.squad?.budget_used_dino_dollars || 0);
 return <section aria-label="Team wallet" className="rounded-xl border border-maroon-200 bg-surface-card p-5">
  <div className="flex justify-between gap-3"><h2 className="font-display text-xl font-bold">Team wallet</h2><span className="text-sm" role="status">{status}</span></div>
  {snapshot ? <dl className="mt-4 grid gap-4 sm:grid-cols-3"><div><dt>Starting budget</dt><dd className="font-semibold">{formatDinoDollars(budget)}</dd></div><div><dt>Saved spending</dt><dd>{formatDinoDollars(spent)}</dd></div><div><dt>Saved money available</dt><dd aria-live="polite" className="font-semibold">{formatDinoDollars(budget-spent)}</dd></div></dl> : <p>Loading saved balance...</p>}
  {previewRemaining!==undefined && <p aria-live="polite" className={`mt-3 font-semibold ${previewRemaining<0 ? 'text-red-700' : ''}`}>After your unsaved selections: {formatDinoDollars(previewRemaining)}</p>}
  {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
 </section>;
}
