/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

type Run = { id: string; status: string; stats_row_count: number; exact_count: number; review_count: number; rejected_count: number; created_at: string; proposed_migration_sql?: string; rollback_sql?: string };
type Row = { id: string; classification: string; review_status: string; review_reason: string; match_date: string | null; opponent: string | null; playhq_game_id: string | null; source_hash: string | null; predicted_fantasy_score_delta: number };

type Season = { id: string; name: string; slug: string };
type BaselinePreview = {
  rows: Array<{ rowNumber: number; playerDisplayName: string | null; submittedPlayerName: string; sourceStatus: string | null; appearances: number | null; priorAveragePoints: number | null; errors: string[] }>;
  errors: string[];
  missingPlayerNames: string[];
  summary: { rowsParsed: number; validRows: number; errorRows: number; coveredPlayers: number; missingPlayers: number };
};

export default function FantasyReconciliationPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [targetSeasonId, setTargetSeasonId] = useState('');
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
    const [runRes, seasonRes] = await Promise.all([
      fetch('/api/admin/fantasy/reconciliation', { cache: 'no-store', credentials: 'include' }),
      fetch('/api/admin/fantasy/seasons', { cache: 'no-store', credentials: 'include' }),
    ]);
    const runJson = await runRes.json();
    const seasonJson = await seasonRes.json();
    if (runJson.success) { setRuns(runJson.runs || []); setDinoPlayers(runJson.dinoPlayers || []); setReadiness(runJson.readiness); }
    if (seasonJson.success) {
      const realSeasons = (seasonJson.seasons || []).filter((season: Season) => season.slug !== 'legacy-unverified');
      setSeasons(realSeasons);
      setTargetSeasonId((current) => current || realSeasons[0]?.id || '');
    }
  }

  async function loadRows(run: Run) {
    setSelectedRun(run);
    const res = await fetch(`/api/admin/fantasy/reconciliation/${run.id}/rows`, { cache: 'no-store', credentials: 'include' });
    const json = await res.json();
    if (json.success) setRows(json.rows || []);
  }

  async function createRun() {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/fantasy/reconciliation', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetSeasonId, playhqCandidates: [] }) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not create reconciliation run.');
      setMessage(`Created reconciliation run. Exact matches: ${json.summary.exact}. Review required: ${json.summary.requiresReview}.`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not create reconciliation run.');
    } finally {
      setBusy(false);
    }
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

  async function bulkApproveExact() {
    if (!selectedRun) return;
    setBusy(true);
    const res = await fetch(`/api/admin/fantasy/reconciliation/${selectedRun.id}/rows`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bulk_approve_exact' }) });
    const json = await res.json();
    setMessage(json.success ? 'Deterministic exact matches approved for proposal only. No statistics were reassigned.' : json.error || 'Bulk approval failed.');
    await loadRows(selectedRun);
    setBusy(false);
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
            <h2 className="text-lg font-display font-bold text-content-primary">Prior-season baseline import</h2>
            <p className="mt-1 max-w-3xl text-sm text-content-muted">Use this if PlayHQ supplies a committee export. Every current player needs one explicit outcome. The import is validated, hashed and audited before draft Dino Dollar prices are calculated.</p>
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
          <Button type="button" variant="secondary" disabled={busy || !baselineCsv.trim()} onClick={() => submitBaseline('preview')}>Validate baseline</Button>
          <Button type="button" disabled={busy || !baselinePreview || baselinePreview.summary.errorRows > 0 || baselinePreview.summary.missingPlayers > 0} onClick={() => submitBaseline('apply')}>Apply reviewed baseline</Button>
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

      <h2 className="text-xl font-display font-bold">Historical evidence runs</h2>

      <Card><CardContent>
        <h2 className="text-lg font-display font-bold text-content-primary">Create review run</h2>
        <p className="mt-1 text-sm text-content-muted">Choose the reviewed target Fantasy season. Legacy rows are never reassigned here.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-sm font-semibold text-content-primary">Target season
            <select className="mt-1 block w-full rounded-lg border border-edge-strong px-3 py-2" value={targetSeasonId} onChange={(e) => setTargetSeasonId(e.target.value)}>
              {seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
            </select>
          </label>
          <Button type="button" onClick={createRun} disabled={busy || !targetSeasonId}>Create read-only run</Button>
        </div>
      </CardContent></Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card><CardContent>
          <h2 className="text-lg font-display font-bold text-content-primary">Runs</h2>
          <div className="mt-4 space-y-3">
            {runs.map((run) => (
              <button key={run.id} type="button" onClick={() => loadRows(run)} className="block w-full rounded-lg border border-edge-subtle p-3 text-left hover:bg-surface-page focus-ring">
                <span className="block text-sm font-semibold text-content-primary">{new Date(run.created_at).toLocaleString()}</span>
                <span className="mt-1 block text-xs text-content-muted">Rows {run.stats_row_count} · exact {run.exact_count} · review {run.review_count} · rejected {run.rejected_count}</span>
              </button>
            ))}
            {!runs.length && <p className="text-sm text-content-muted">No reconciliation runs yet.</p>}
          </div>
        </CardContent></Card>

        <Card><CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-display font-bold text-content-primary">Review rows</h2>
              <p className="mt-1 text-sm text-content-muted">Only deterministic exact matches can be bulk approved. Ambiguous or conflicting rows stay quarantined.</p>
            </div>
            {selectedRun && <div className="flex gap-2"><Button type="button" variant="secondary" onClick={bulkApproveExact} disabled={busy}>Approve exact only</Button><a className="rounded-lg border border-edge-strong px-3 py-2 text-sm font-semibold" href={`/api/admin/fantasy/reconciliation?export=${selectedRun.id}`}>Export CSV</a></div>}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead><tr className="border-b text-xs uppercase text-content-muted"><th className="py-2 pr-3">Class</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Fixture</th><th className="py-2 pr-3">Evidence</th><th className="py-2 pr-3">Score delta</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.id} className="border-b align-top"><td className="py-2 pr-3 font-semibold">{row.classification.replace(/_/g, ' ')}</td><td className="py-2 pr-3">{row.review_status}</td><td className="py-2 pr-3">{row.match_date || 'No date'}<br />{row.opponent || 'No opponent'}</td><td className="py-2 pr-3">{row.review_reason}<br /><span className="text-xs text-content-muted">{row.playhq_game_id || 'No PlayHQ game'} · {row.source_hash ? 'hash captured' : 'no hash'}</span></td><td className="py-2 pr-3">{row.predicted_fantasy_score_delta}</td></tr>)}</tbody>
            </table>
            {!rows.length && <p className="mt-4 text-sm text-content-muted">Select a run to review rows.</p>}
          </div>
          {selectedRun?.proposed_migration_sql && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Migration proposal preview</summary><pre className="mt-2 overflow-x-auto rounded-lg bg-gray-950 p-4 text-xs text-gray-100">{selectedRun.proposed_migration_sql}</pre></details>}
        </CardContent></Card>
      </div>
    </div>
  );
}
