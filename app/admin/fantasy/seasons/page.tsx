/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Card, { CardContent } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import { categoriseAdminSeasons } from '@/lib/fantasy-seasons';

const STATUSES = ['draft', 'upcoming', 'active', 'completed', 'archived'];

export default function AdminFantasySeasonsPage() {
  const [seasons, setSeasons] = useState<any[]>([]);
  const [gradeSources, setGradeSources] = useState<any[]>([]);
  const [playhqSeasons, setPlayhqSeasons] = useState<any[]>([]);
  const [playhqError, setPlayhqError] = useState<string | null>(null);
  const [jobsBySeason, setJobsBySeason] = useState<Record<string, any[]>>({});
  const [gradePanel, setGradePanel] = useState<{ seasonId: string; playhqGrades: any[]; sources: any[]; error: string | null } | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', playhqSeasonId: '', startDate: '', endDate: '', status: 'draft', isPublic: false });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<any | null>(null);
  const [preview, setPreview] = useState<{ seasonId: string; data: any } | null>(null);

  const load = useCallback(async (discover = false) => {
    try {
      const result = await parseApiResponse<any>(await adminFetch(`/api/admin/fantasy/seasons${discover ? '?discover=1' : ''}`));
      setSeasons(result.seasons || []);
      setGradeSources(result.gradeSources || []);
      if (discover) { setPlayhqSeasons(result.playhqSeasons || []); setPlayhqError(result.playhqError || null); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load seasons.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true); setError(null); setFeedback(null);
    try { await fn(); if (done) setFeedback(done); } catch (err) { setError(err instanceof Error ? err.message : 'Action failed.'); } finally { setBusy(false); }
  };

  const patchSeason = (seasonId: string, patch: Record<string, unknown>, done: string) => run(async () => {
    await parseApiResponse(await adminFetch('/api/admin/fantasy/seasons', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seasonId, ...patch }) }));
    await load();
  }, done);

  const createSeason = () => run(async () => {
    await parseApiResponse(await adminFetch('/api/admin/fantasy/seasons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }));
    setForm({ name: '', slug: '', playhqSeasonId: '', startDate: '', endDate: '', status: 'draft', isPublic: false });
    await load();
  }, 'Season created.');

  const openGrades = (seasonId: string) => run(async () => {
    const result = await parseApiResponse<any>(await adminFetch(`/api/admin/fantasy/seasons/${seasonId}/grades`));
    setGradePanel({ seasonId, playhqGrades: result.playhqGrades || [], sources: result.sources || [], error: result.playhqError || null });
  });

  const toggleGrade = (grade: any, enabled: boolean) => run(async () => {
    if (!gradePanel) return;
    const result = await parseApiResponse<any>(await adminFetch(`/api/admin/fantasy/seasons/${gradePanel.seasonId}/grades`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grades: [{ playhqGradeId: grade.playhq_grade_id || grade.id, gradeName: grade.grade_name || grade.name, enabled }] }),
    }));
    setGradePanel({ ...gradePanel, sources: result.sources || [] });
    await load();
  }, 'Grade mapping saved.');

  const loadJobs = (seasonId: string) => run(async () => {
    const result = await parseApiResponse<any>(await adminFetch(`/api/admin/fantasy/sync?seasonId=${seasonId}`));
    setJobsBySeason((prev) => ({ ...prev, [seasonId]: result.jobs || [] }));
  });

  const syncAction = (seasonId: string, body: Record<string, unknown>, done: string) => run(async () => {
    await parseApiResponse(await adminFetch('/api/admin/fantasy/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    const result = await parseApiResponse<any>(await adminFetch(`/api/admin/fantasy/sync?seasonId=${seasonId}`));
    setJobsBySeason((prev) => ({ ...prev, [seasonId]: result.jobs || [] }));
  }, done);

  const sourcesFor = (seasonId: string) => gradeSources.filter((source) => source.season_id === seasonId);
  const seasonGroups = categoriseAdminSeasons(seasons);

  const loadHealth = useCallback(async () => {
    try {
      const result = await parseApiResponse<any>(await adminFetch('/api/admin/fantasy/sync?health=1'));
      setHealth(result.health || null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load sync health.'); }
  }, []);
  useEffect(() => { loadHealth(); }, [loadHealth]);

  const runPreview = (seasonId: string) => run(async () => {
    const result = await parseApiResponse<any>(await adminFetch('/api/admin/fantasy/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', seasonId }),
    }));
    setPreview({ seasonId, data: result.preview || null });
  }, 'Preview complete — nothing was written or published.');

  const runOrchestrator = () => run(async () => {
    await parseApiResponse(await adminFetch('/api/admin/fantasy/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'orchestrate' }) }));
    await Promise.all([load(), loadHealth()]);
  }, 'Automatic sync run finished. Review the health panel below.');

  const clearOperationalLogs = (seasonId?: string) => run(async () => {
    const suffix = seasonId ? `?seasonId=${encodeURIComponent(seasonId)}` : '';
    const preview = await parseApiResponse<any>(await adminFetch(`/api/admin/fantasy/logs${suffix}`));
    const count = Number(preview.preview?.sync_runs || 0);
    const confirmation = window.prompt(`This removes ${count} operational sync log entries and resets stale error/retry fields. Match stats, prices, payments, entries and import lineage are preserved. Type CLEAR LOGS to continue.`);
    if (confirmation !== 'CLEAR LOGS') return;
    await parseApiResponse(await adminFetch('/api/admin/fantasy/logs', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation, seasonId }) }));
    await loadHealth();
  }, 'Operational sync logs cleared. Authoritative game, payment and audit records were preserved.');

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-content-primary mb-2">Fantasy Seasons &amp; PlayHQ Sync</h1>
      <p className="text-content-muted font-body mb-6">Manage fantasy seasons, map PlayHQ grades, run resumable stat imports and control public visibility.</p>
      {feedback && <p className="mb-4 text-green-700 font-body">{feedback}</p>}
      {error && <p className="mb-4 text-red-600 font-body" role="alert">{error}</p>}

      {/* Automatic sync health */}
      <Card className="mb-6">
        <CardContent className="p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-display font-bold text-content-primary">Automatic PlayHQ sync</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => loadHealth()}>Refresh health</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => clearOperationalLogs()}>Clear all operational logs</Button>
              <Button size="sm" disabled={busy} onClick={runOrchestrator}>Run automatic sync now</Button>
            </div>
          </div>
          {!health ? (
            <p className="text-sm text-content-muted font-body">Loading sync health…</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-body text-content-muted">
                Scheduled sync {health.syncEnabled ? 'enabled' : <span className="font-semibold text-amber-700">explicitly disabled (remove PLAYHQ_FANTASY_SYNC_ENABLED=false in Vercel)</span>} · PlayHQ credentials {health.playhqConfigured ? 'configured' : <span className="font-semibold text-amber-700">missing</span>}
              </p>
              {(health.seasons || []).filter((s: any) => s.is_current && s.auto_sync_enabled).map((s: any) => {
                const seasonJobs = (health.jobs || []).filter((j: any) => j.season_id === s.id);
                const job = seasonJobs[0];
                const grades = (health.gradeSources || []).filter((g: any) => g.season_id === s.id);
                const pct = job && job.total_games ? Math.round((job.processed_games / job.total_games) * 100) : null;
                const seasonHealth = (health.syncHealth || []).find((h: any) => h.season_id === s.id);
                const ready = (health.readiness || []).find((r: any) => r.season_id === s.id);
                const awaitingPlayHQ = !s.playhq_season_id;
                return (
                  <div key={s.id} className="rounded-lg border border-edge-subtle p-3 text-xs font-body text-content-muted space-y-1">
                    <p className="text-sm font-semibold text-content-primary">{s.slug}
                      {s.is_current ? ' · current' : ''} · {s.playhq_season_id ? `PlayHQ ${s.playhq_season_id}` : ''}
                      {awaitingPlayHQ && <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-blue-800 font-semibold">Awaiting PlayHQ</span>}
                      {s.last_playhq_sync_at ? ` · last sync ${new Date(s.last_playhq_sync_at).toLocaleString()}` : ' · never synced'}
                    </p>
                    {awaitingPlayHQ && (
                      <p className="text-blue-800">
                        PlayHQ has not published a matching season yet. Automatic match-stat sync is paused until the
                        season is linked and activated; this is an expected waiting state.
                      </p>
                    )}
                    <p>Grade mappings: {grades.filter((g: any) => g.enabled).map((g: any) => g.grade_name).join(', ') || 'none'}{grades.some((g: any) => !g.enabled) ? ` (+${grades.filter((g: any) => !g.enabled).length} disabled)` : ''}</p>
                    {seasonHealth && (
                      <p>
                        Health: discovery {seasonHealth.last_successful_discovery ? new Date(seasonHealth.last_successful_discovery).toLocaleString() : 'never'}
                        {' '}· game import {seasonHealth.last_successful_game_import ? new Date(seasonHealth.last_successful_game_import).toLocaleString() : 'never'}
                        {' '}· raw entries {seasonHealth.raw_entries} · queued {seasonHealth.queued_games} · processed {seasonHealth.processed_games}
                        {' '}· matched players {seasonHealth.matched_players} · ambiguous {seasonHealth.ambiguous_players} · failed games {seasonHealth.failed_games}
                        {seasonHealth.next_retry_at ? ` · next retry ${new Date(seasonHealth.next_retry_at).toLocaleString()}` : ''}
                        {seasonHealth.last_error ? <span className="text-red-600"> · last error: {seasonHealth.last_error}</span> : ''}
                      </p>
                    )}
                    {ready && (
                      <p>
                        Season readiness:
                        {' '}{ready.playhq_season_linked ? '✓' : '✗'} PlayHQ linked
                        {' '}· {ready.grades_mapped > 0 ? `✓ ${ready.grades_mapped} grades` : '✗ grades'}
                        {' '}· {ready.players_linked > 0 ? `✓ ${ready.players_linked}/${ready.players_total} players linked` : `✗ 0/${ready.players_total} players linked${ready.players_total > 0 ? ' (provisional carry-forward)' : ''}`}
                        {' '}· {ready.fixtures_imported ? '✓' : '✗'} fixtures
                        {' '}· {ready.completed_match_stats_imported ? `✓ ${ready.published_stat_rows} stats` : '✗ match stats'}
                        {' '}· {ready.unresolved_reviews > 0 ? `⚠ ${ready.unresolved_reviews} unresolved reviews` : '✓ no unresolved reviews'}
                      </p>
                    )}
                    {job && (
                      <p>Latest job: <span className="font-semibold">{job.status}</span> · {job.processed_games}/{job.total_games} games{pct !== null ? ` (${pct}%)` : ''} · created {job.counts?.created ?? 0} · matched {job.counts?.matched ?? 0} · updated {job.counts?.updated ?? 0} · skipped {job.counts?.skipped ?? 0} · failed {job.failed_games ?? 0} · review items {(job.review_items || []).length}</p>
                    )}
                    {s.sync_exception && <p className="text-red-600">Blocking exception: {s.sync_exception}</p>}
                  </div>
                );
              })}
              {(health.recentRuns || []).length > 0 && (
                <details className="text-xs font-body text-content-muted">
                  <summary className="cursor-pointer font-semibold text-content-primary">Recent automation activity ({health.recentRuns.length})</summary>
                  <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
                    {health.recentRuns.map((r: any) => (
                      <p key={r.id} className={r.status === 'error' || r.status === 'blocked' ? 'text-red-600' : ''}>
                        {new Date(r.created_at).toLocaleString()} · {r.invoked_by} · {r.stage} · {r.status}{r.error ? ` — ${r.error}` : ''}
                      </p>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {seasonGroups.operational.map((season) => {
          const jobs = jobsBySeason[season.id] || [];
          const latestJob = jobs[0];
          return (
            <Card key={season.id}>
              <CardContent className="p-5 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-display font-bold text-content-primary">{season.name}</h2>
                  <span className="rounded-full bg-maroon-50 dark:bg-maroon-950 px-2 py-0.5 text-xs text-maroon-700 dark:text-maroon-200 font-body">{season.status}</span>
                  {season.is_current && <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs text-gold-800 font-body">Current</span>}
                  {!season.is_public && <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-content-muted font-body">Hidden</span>}
                  <span className="text-xs text-content-muted font-body">slug: {season.slug}{season.playhq_season_id ? ` · PlayHQ: ${season.playhq_season_id}` : ' · No PlayHQ link'}</span>
                </div>
                <div className="flex flex-wrap gap-3 text-sm font-body">
                  {([['is_public', 'isPublic', 'Public'], ['auto_sync_enabled', 'autoSyncEnabled', 'Auto sync enabled'], ['allow_team_building', 'allowTeamBuilding', 'Team building'], ['registration_open', 'registrationOpen', 'Registration open'], ['team_selection_open', 'teamSelectionOpen', 'Team selection open']] as const).map(([column, key, label]) => (
                    <label key={key} className="flex items-center gap-2">
                      <input type="checkbox" checked={season[column] === true} disabled={busy} onChange={(e) => patchSeason(season.id, { [key]: e.target.checked }, `${label} updated.`)} />{label}
                    </label>
                  ))}
                  <label className="flex items-center gap-2">Status
                    <select className="rounded border border-edge-strong px-2 py-1" value={season.status} disabled={busy} onChange={(e) => patchSeason(season.id, { status: e.target.value }, 'Status updated.')}>
                      {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                  {!season.is_current && <Button size="sm" variant="secondary" disabled={busy} onClick={() => patchSeason(season.id, { isCurrent: true }, 'Current season updated.')}>Set as current</Button>}
                </div>
                <div className="text-xs text-content-muted font-body">
                  Enabled grades: {sourcesFor(season.id).filter((source) => source.enabled).map((source) => source.grade_name).join(', ') || 'none yet'}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => openGrades(season.id)}>Map PlayHQ grades</Button>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => loadJobs(season.id)}>View import jobs</Button>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => runPreview(season.id)}>Run Preview</Button>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => clearOperationalLogs(season.id)}>Clear this season&apos;s logs</Button>
                  <Button size="sm" disabled={busy || !season.playhq_season_id} onClick={() => syncAction(season.id, { action: 'start', seasonId: season.id }, 'Import started; continue batches until complete.')}>Start PlayHQ import</Button>
                  {latestJob && !['completed', 'cancelled'].includes(latestJob.status) && (
                    <Button size="sm" disabled={busy} onClick={() => syncAction(season.id, { action: 'continue', jobId: latestJob.id }, 'Processed the next batch.')}>Continue import</Button>
                  )}
                  {latestJob && latestJob.failed_games > 0 && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => syncAction(season.id, { action: 'retry_failed', jobId: latestJob.id }, 'Failed games requeued.')}>Retry failures</Button>
                  )}
                </div>
                {preview && preview.seasonId === season.id && preview.data && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/30 p-3 space-y-1 text-xs font-body text-content-muted">
                    <p className="text-sm font-semibold text-content-primary">Sync preview (read-only — nothing was written)</p>
                    {preview.data.awaiting_playhq && <p className="text-blue-800 font-semibold">Awaiting PlayHQ: no matching published season found yet.</p>}
                    {preview.data.proposed_link && (
                      <p>Proposed PlayHQ link: {preview.data.proposed_link.name} ({preview.data.proposed_link.playhq_season_id})</p>
                    )}
                    {preview.data.grades && (
                      <p>
                        Grades: {preview.data.grades.existing?.length ?? 0} existing
                        {preview.data.grades.proposed_new?.length
                          ? ` · ${preview.data.grades.proposed_new.length} new proposed: ${preview.data.grades.proposed_new.map((g: any) => g.grade_name).join(', ')}`
                          : ' · no new grades proposed'}
                      </p>
                    )}
                    {preview.data.queue && preview.data.queue.note && <p>{preview.data.queue.note}</p>}
                    {preview.data.queue && preview.data.queue.note === undefined && (
                      <>
                        <p>
                          Queue: {preview.data.queue.queued_games} game(s) would be imported from {preview.data.queue.raw_entries} raw entries
                          {' '}· {preview.data.queue.review_items?.length ?? 0} pre-queue review item(s)
                          {' '}· {preview.data.queue.skipped_grades?.length ?? 0} skipped grade(s)
                        </p>
                        {preview.data.queue.empty_queue_invariant_breached && (
                          <p className="text-red-600 font-semibold">
                            Invariant breach: raw entries exist but nothing would be queued — a real run would park as needs_review.
                          </p>
                        )}
                        {(preview.data.queue.sample || []).slice(0, 8).map((entry: any) => (
                          <p key={entry.gameId}>· {entry.matchDate || 'TBC'} — {entry.homeTeam} v {entry.awayTeam} ({entry.gradeName}, round {entry.roundNumber ?? '?'})</p>
                        ))}
                      </>
                    )}
                  </div>
                )}
                {gradePanel && gradePanel.seasonId === season.id && (
                  <div className="rounded-lg border border-edge-subtle p-3 space-y-2">
                    <p className="text-sm font-body font-semibold text-content-primary">PlayHQ grades for this season</p>
                    {gradePanel.error && <p className="text-sm text-red-600 font-body">{gradePanel.error}</p>}
                    {!gradePanel.playhqGrades.length && !gradePanel.error && <p className="text-sm text-content-muted font-body">No PlayHQ grades returned. Link a PlayHQ season id first.</p>}
                    {gradePanel.playhqGrades.map((grade: any) => {
                      const source = gradePanel.sources.find((item: any) => item.playhq_grade_id === grade.id);
                      return (
                        <label key={grade.id} className="flex items-center gap-2 text-sm font-body">
                          <input type="checkbox" checked={source?.enabled === true} disabled={busy} onChange={(e) => toggleGrade(source || grade, e.target.checked)} />
                          {grade.name} <span className="text-xs text-gray-400">({grade.id})</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {jobs.length > 0 && (
                  <div className="rounded-lg border border-edge-subtle p-3 space-y-2">
                    <p className="text-sm font-body font-semibold text-content-primary">Import jobs</p>
                    {jobs.map((job: any) => (
                      <div key={job.id} className="text-xs font-body text-content-muted border-b border-edge-subtle pb-2">
                        <p><span className="font-semibold">{job.status}</span> · {job.processed_games}/{job.total_games} games · ok {job.successful_games} · failed {job.failed_games} · created {job.counts?.created ?? 0} · matched {job.counts?.matched ?? 0} · updated {job.counts?.updated ?? 0} · skipped {job.counts?.skipped ?? 0} · warnings {job.counts?.warnings ?? 0}</p>
                        {(job.review_items || []).slice(0, 8).map((item: any, index: number) => <p key={index} className="text-amber-700">Review ({item.type}): {item.detail}</p>)}
                        {(job.error_summary || []).slice(0, 5).map((item: any, index: number) => <p key={index} className="text-red-600">Game {item.gameId}: {item.message}</p>)}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {seasonGroups.referenceOnly.length > 0 && (
        <Card className="mt-6">
          <CardContent className="p-5">
            <h2 className="text-lg font-display font-bold text-content-primary">Prior-season price evidence</h2>
            <p className="mt-1 text-sm text-content-muted font-body">
              These seasons are retained as read-only evidence for opening Dino Dollar prices. They are not live import or participant season options.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-content-secondary font-body">
              {seasonGroups.referenceOnly.map((season) => (
                <li key={season.id}>{season.name} - {season.slug === 'legacy-unverified' ? 'quarantined legacy evidence' : 'verified baseline reference'}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardContent className="p-5 space-y-3">
          <h2 className="text-lg font-display font-bold text-content-primary">Add a season</h2>
          <div className="flex flex-wrap gap-2 items-center">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => load(true)}>Discover PlayHQ seasons</Button>
            {playhqError && <span className="text-sm text-red-600 font-body">{playhqError}</span>}
          </div>
          {playhqSeasons.length > 0 && (
            <div className="space-y-1">
              {playhqSeasons.map((season: any) => (
                <button key={season.id} type="button" className="block text-left text-sm font-body text-maroon-700 dark:text-maroon-200 hover:underline" onClick={() => setForm({ ...form, name: `NDCC Fantasy ${season.name}`, slug: season.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), playhqSeasonId: season.id, startDate: season.startDate?.slice(0, 10) || '', endDate: season.endDate?.slice(0, 10) || '' })}>
                  Use “{season.name}” ({season.id})
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input id="season-name" label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input id="season-slug" label="Slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            <Input id="season-playhq" label="PlayHQ season id (optional)" value={form.playhqSeasonId} onChange={(e) => setForm({ ...form, playhqSeasonId: e.target.value })} />
            <label className="flex flex-col gap-1 text-sm font-body">Status
              <select className="rounded border border-edge-strong px-2 py-2" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <Input id="season-start" label="Start date" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            <Input id="season-end" label="End date" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm font-body"><input type="checkbox" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} />Publicly visible</label>
          <Button disabled={busy || !form.name || !form.slug} onClick={createSeason}>Create season</Button>
        </CardContent>
      </Card>
    </div>
  );
}
