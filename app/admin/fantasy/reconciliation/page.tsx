'use client';

import { useEffect, useState } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

type Run = { id: string; status: string; stats_row_count: number; exact_count: number; review_count: number; rejected_count: number; created_at: string; proposed_migration_sql?: string; rollback_sql?: string };
type Row = { id: string; classification: string; review_status: string; review_reason: string; match_date: string | null; opponent: string | null; playhq_game_id: string | null; source_hash: string | null; predicted_fantasy_score_delta: number };

type Season = { id: string; name: string; slug: string };

export default function FantasyReconciliationPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [targetSeasonId, setTargetSeasonId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [runRes, seasonRes] = await Promise.all([
      fetch('/api/admin/fantasy/reconciliation', { cache: 'no-store', credentials: 'include' }),
      fetch('/api/admin/fantasy/seasons', { cache: 'no-store', credentials: 'include' }),
    ]);
    const runJson = await runRes.json();
    const seasonJson = await seasonRes.json();
    if (runJson.success) setRuns(runJson.runs || []);
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
        <h1 className="text-2xl font-display font-bold text-content-primary">Historical Fantasy reconciliation</h1>
        <p className="mt-1 max-w-4xl text-sm text-content-muted font-body">Review Legacy / Unverified statistics against official PlayHQ source data. This workflow is read-only against match statistics: it prepares evidence, export files and SQL proposals only.</p>
      </div>

      {message && <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900" role="status">{message}</div>}

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
