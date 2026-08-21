/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

type BaselinePreview = {
  rows: Array<{ rowNumber: number; playerDisplayName: string | null; submittedPlayerName: string; sourceStatus: string | null; appearances: number | null; priorAveragePoints: number | null; errors: string[] }>;
  errors: string[];
  missingPlayerNames: string[];
  summary: { rowsParsed: number; validRows: number; errorRows: number; coveredPlayers: number; missingPlayers: number };
};

export default function FantasyReconciliationPage() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [dinoPlayers, setDinoPlayers] = useState<any[]>([]);
  const [readiness, setReadiness] = useState<any>(null);
  const [baselineCsv, setBaselineCsv] = useState('');
  const [baselineFilename, setBaselineFilename] = useState('');
  const [baselineSourceUrl, setBaselineSourceUrl] = useState('');
  const [baselineSourceSeason, setBaselineSourceSeason] = useState('2025/2026');
  const [baselineSourceType, setBaselineSourceType] = useState<'committee_playhq_export' | 'committee_manual_baseline'>('committee_playhq_export');
  const [baselinePreview, setBaselinePreview] = useState<BaselinePreview | null>(null);

  async function load() {
    const runRes = await fetch('/api/admin/fantasy/reconciliation', { cache: 'no-store', credentials: 'include' });
    const runJson = await runRes.json();
    if (runJson.success) { setDinoPlayers(runJson.dinoPlayers || []); setReadiness(runJson.readiness); }
  }
  async function pricing(action:'recalculate'|'publish'){setBusy(true);setMessage('');try{const res=await fetch('/api/admin/fantasy/pricing',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});const json=await res.json();if(!res.ok)throw new Error(json.error);setMessage(action==='publish'?'Dino Dollar prices published.':'Dino Dollar prices recalculated from verified evidence.');await load();}catch(err){setMessage(err instanceof Error?err.message:'Pricing action failed.');}finally{setBusy(false);}}

  async function readBaselineFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { setMessage('Choose a CSV file for the baseline import.'); return; }
    try {
      setBaselineCsv(await file.text());
      setBaselineFilename(file.name);
      setBaselinePreview(null);
      setMessage('');
    } catch { setMessage('The selected baseline CSV could not be read.'); }
  }

  async function submitBaseline(action: 'preview' | 'apply') {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/fantasy/baseline-import', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, csvText: baselineCsv, filename: baselineFilename, sourceUrl: baselineSourceUrl, sourceSeasonLabel: baselineSourceSeason, sourceType: baselineSourceType }),
      });
      const json = await res.json();
      if (json.preview) setBaselinePreview(json.preview);
      if (!res.ok || !json.success) throw new Error(json.error || 'Baseline import failed.');
      if (action === 'preview') {
        setMessage(json.preview.summary.missingPlayers === 0 && json.preview.summary.errorRows === 0
          ? `Baseline validation passed for all ${json.preview.summary.coveredPlayers} current players.`
          : `Baseline needs attention: ${json.preview.summary.errorRows} invalid row(s), ${json.preview.summary.missingPlayers} current player(s) missing.`);
      } else {
        setMessage(`Reviewed baseline applied to ${json.result.players} players. Prices remain unpublished until the separate Publish prices gate is used.`);
        await load();
      }
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Baseline import failed.'); }
    finally { setBusy(false); }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-content-primary">Dino Coach player reconciliation</h1>
        <p className="mt-1 max-w-4xl text-sm text-content-muted font-body">Current-player identity, source status and published price evidence. Ambiguous matches remain quarantined.</p>
      </div>

      {message && <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900" role="status">{message}</div>}

      <Card><CardContent>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-display font-bold text-content-primary">Prior-season price evidence</h2>
            <p className="mt-1 max-w-3xl text-sm text-content-muted">This reference-only evidence calculates opening Dino Dollar prices; it never becomes a live competition season. Every current player needs one explicit, audited outcome.</p>
          </div>
          <a className="inline-flex min-h-11 items-center justify-center rounded-lg border border-edge-strong px-3 py-2 text-sm font-semibold focus-ring" href="/api/admin/fantasy/baseline-import?template=1">Download roster template</a>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-content-primary">Source season
            <input className="mt-1 block min-h-11 w-full rounded-lg border border-edge-strong px-3 py-2" value={baselineSourceSeason} onChange={(event) => setBaselineSourceSeason(event.target.value)} />
          </label>
          <label className="text-sm font-semibold text-content-primary">Evidence type
            <select className="mt-1 block min-h-11 w-full rounded-lg border border-edge-strong px-3 py-2" value={baselineSourceType} onChange={(event) => setBaselineSourceType(event.target.value as typeof baselineSourceType)}>
              <option value="committee_playhq_export">Committee PlayHQ export</option>
              <option value="committee_manual_baseline">Reviewed manual baseline</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-content-primary">CSV file
            <input className="mt-1 block min-h-11 w-full text-sm" type="file" accept=".csv,text/csv" onChange={readBaselineFile} />
          </label>
          <label className="text-sm font-semibold text-content-primary">Source URL (optional)
            <input className="mt-1 block min-h-11 w-full rounded-lg border border-edge-strong px-3 py-2" type="url" value={baselineSourceUrl} onChange={(event) => setBaselineSourceUrl(event.target.value)} placeholder="Public PlayHQ report or committee evidence URL" />
          </label>
        </div>
        <label className="mt-4 block text-sm font-semibold text-content-primary">CSV contents
          <textarea className="mt-1 min-h-52 w-full rounded-lg border border-edge-strong px-3 py-2 font-mono text-xs" value={baselineCsv} onChange={(event) => { setBaselineCsv(event.target.value); setBaselineFilename(''); setBaselinePreview(null); }} placeholder="player_name,playhq_player_id,source_status,appearances,role_neutral_points,source_reference" />
        </label>
        <p className="mt-2 text-xs text-content-muted">Allowed outcomes: verified_playhq, verified_no_prior_appearance, international_manual, international_premium. Role-neutral points must already include exclusive milestones and not-out bonuses, with no role or captain multiplier.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" variant="secondary" disabled={busy || !baselineCsv.trim()} onClick={() => submitBaseline('preview')}>Validate price evidence</Button>
          <Button type="button" disabled={busy || !baselinePreview || baselinePreview.summary.errorRows > 0 || baselinePreview.summary.missingPlayers > 0} onClick={() => submitBaseline('apply')}>Apply reviewed price evidence</Button>
        </div>
        {baselinePreview && <div className="mt-5" aria-live="polite">
          <dl className="grid gap-3 sm:grid-cols-4">
            <div><dt className="text-xs text-content-muted">Covered</dt><dd className="text-xl font-bold">{baselinePreview.summary.coveredPlayers}</dd></div>
            <div><dt className="text-xs text-content-muted">Missing</dt><dd className="text-xl font-bold">{baselinePreview.summary.missingPlayers}</dd></div>
            <div><dt className="text-xs text-content-muted">Valid rows</dt><dd className="text-xl font-bold">{baselinePreview.summary.validRows}</dd></div>
            <div><dt className="text-xs text-content-muted">Error rows</dt><dd className="text-xl font-bold">{baselinePreview.summary.errorRows}</dd></div>
          </dl>
          {(baselinePreview.errors.length > 0 || baselinePreview.summary.errorRows > 0) && <div className="mt-4 max-h-64 overflow-auto rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {baselinePreview.errors.map((error) => <p key={error}>{error}</p>)}
            {baselinePreview.rows.filter((row) => row.errors.length).slice(0, 30).map((row) => <p key={row.rowNumber}>Row {row.rowNumber} ({row.submittedPlayerName || 'unnamed'}): {row.errors.join('; ')}</p>)}
            {baselinePreview.summary.errorRows > 30 && <p>Only the first 30 row errors are shown.</p>}
          </div>}
          {baselinePreview.missingPlayerNames.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Missing current players</summary><p className="mt-2 text-sm text-content-muted">{baselinePreview.missingPlayerNames.join(', ')}</p></details>}
        </div>}
      </CardContent></Card>

      <Card><CardContent><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-display font-bold">Current release coverage</h2><p className={readiness?.ready?'mt-2 text-green-700':'mt-2 text-amber-800'}>{readiness?.ready?'Ready to launch.':(readiness?.blockers||['Readiness unavailable.']).join(' ')}</p></div><div className="flex gap-2"><Button disabled={busy} variant="secondary" onClick={()=>pricing('recalculate')}>Recalculate prices</Button><Button disabled={busy} onClick={()=>pricing('publish')}>Publish prices</Button></div></div><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Player</th><th className="p-2">Outcome</th><th className="p-2">PlayHQ link</th><th className="p-2">Appearances</th><th className="p-2">Price</th><th className="p-2">Published</th></tr></thead><tbody>{dinoPlayers.map((player)=><tr key={player.player_id} className="border-b"><td className="p-2 font-semibold">{player.display_name}</td><td className="p-2">{player.stats_status}</td><td className="p-2">{player.playhq_player_id||player.identity?.decision||'Unresolved'}</td><td className="p-2">{player.prior_regular_appearances}</td><td className="p-2">{player.price?.price_dino_dollars>0?`${Number(player.price.price_dino_dollars).toLocaleString('en-AU')} Dino Dollars`:'Pending'}</td><td className="p-2">{player.price?.published_at?'Yes':'No'}</td></tr>)}</tbody></table></div></CardContent></Card>

    </div>
  );
}
