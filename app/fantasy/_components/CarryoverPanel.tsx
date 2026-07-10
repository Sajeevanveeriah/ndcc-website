/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Card, { CardContent } from '@/components/ui/Card';
import { fantasyJsonFetch } from '@/lib/fantasy-browser';
import { useSeasonParam } from './useSeasonParam';

// Carry a prior-season squad into the currently selected season as a draft.
// Preview first (warnings for unavailable players, role and price changes),
// then apply; the manager still reviews and submits the draft themselves.
export default function CarryoverPanel({ onApplied }: { onApplied?: () => void }) {
  const { season } = useSeasonParam();
  const [seasons, setSeasons] = useState<any[]>([]);
  const [sourceSlug, setSourceSlug] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fantasyJsonFetch<any>('/api/fantasy/seasons')
      .then((result) => setSeasons(result.seasons ?? []))
      .catch(() => setSeasons([]));
  }, []);

  const targetSlug = season || seasons.find((item) => item.is_current)?.slug || '';
  const sourceOptions = seasons.filter((item) => item.slug !== targetSlug);
  if (!seasons.length || !sourceOptions.length) return null;

  const loadPreview = async () => {
    if (!sourceSlug || !targetSlug) return;
    setBusy(true); setError(null); setFeedback(null); setPreview(null);
    try {
      const result = await fantasyJsonFetch<any>(`/api/fantasy/squad/carryover?source=${encodeURIComponent(sourceSlug)}&target=${encodeURIComponent(targetSlug)}`);
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build a carryover preview.');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true); setError(null); setFeedback(null);
    try {
      await fantasyJsonFetch<any>('/api/fantasy/squad/carryover', { method: 'POST', body: JSON.stringify({ source: sourceSlug, target: targetSlug }) });
      setFeedback('Draft squad created from your previous season. Review captaincy, fill any gaps and submit.');
      setPreview(null);
      onApplied?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not carry the squad over.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <h2 className="text-lg font-display font-bold text-gray-900">Carry squad to a new season</h2>
        <p className="text-sm font-body text-gray-600">Copy your latest squad from a previous season into this season as a draft. Unavailable players are dropped and role or price changes are flagged for review.</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm font-body">
            <span className="font-semibold">Copy from</span>
            <select value={sourceSlug} onChange={(event) => { setSourceSlug(event.target.value); setPreview(null); }} className="rounded-md border border-maroon-300 bg-white px-3 py-2 text-sm" aria-label="Season to copy squad from">
              <option value="">Choose season…</option>
              {sourceOptions.map((item) => <option key={item.id} value={item.slug}>{item.name} · {item.statusLabel}</option>)}
            </select>
          </label>
          <Button size="sm" variant="secondary" disabled={busy || !sourceSlug} onClick={loadPreview}>Preview carryover</Button>
        </div>
        {feedback && <p className="text-green-700 font-body text-sm">{feedback}</p>}
        {error && <p className="text-red-600 font-body text-sm" role="alert">{error}</p>}
        {preview && (
          <div className="rounded-lg border border-gray-200 p-4 space-y-2 text-sm font-body">
            <p><strong>{preview.plan.carried.length}</strong> player{preview.plan.carried.length === 1 ? '' : 's'} carried · <strong>{preview.plan.unavailable.length}</strong> unavailable · <strong>{preview.plan.roleChanges.length}</strong> role change{preview.plan.roleChanges.length === 1 ? '' : 's'} · <strong>{preview.plan.priceChanges.length}</strong> price change{preview.plan.priceChanges.length === 1 ? '' : 's'}</p>
            <p>Budget used: <strong>{Number(preview.plan.budgetUsed).toFixed(1)}</strong> · remaining <strong>{Number(preview.plan.budgetRemaining).toFixed(1)}</strong></p>
            {preview.plan.warnings.length > 0 && (
              <ul className="list-disc pl-5 space-y-1 text-amber-800">
                {preview.plan.warnings.map((warning: string) => <li key={warning}>{warning}</li>)}
              </ul>
            )}
            <Button size="sm" disabled={busy || preview.plan.carried.length === 0} onClick={apply}>Create draft in {preview.targetSeason.name}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
