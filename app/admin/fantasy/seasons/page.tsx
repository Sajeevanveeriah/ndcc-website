/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Card, { CardContent } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';

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

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">Fantasy Seasons &amp; PlayHQ Sync</h1>
      <p className="text-gray-500 font-body mb-6">Manage fantasy seasons, map PlayHQ grades, run resumable stat imports and control public visibility.</p>
      {feedback && <p className="mb-4 text-green-700 font-body">{feedback}</p>}
      {error && <p className="mb-4 text-red-600 font-body" role="alert">{error}</p>}

      <div className="space-y-4">
        {seasons.map((season) => {
          const jobs = jobsBySeason[season.id] || [];
          const latestJob = jobs[0];
          return (
            <Card key={season.id}>
              <CardContent className="p-5 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-display font-bold text-gray-900">{season.name}</h2>
                  <span className="rounded-full bg-maroon-50 px-2 py-0.5 text-xs text-maroon-700 font-body">{season.status}</span>
                  {season.is_current && <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs text-gold-800 font-body">Current</span>}
                  {!season.is_public && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 font-body">Hidden</span>}
                  <span className="text-xs text-gray-500 font-body">slug: {season.slug}{season.playhq_season_id ? ` · PlayHQ: ${season.playhq_season_id}` : ' · No PlayHQ link'}</span>
                </div>
                <div className="flex flex-wrap gap-3 text-sm font-body">
                  {([['is_public', 'isPublic', 'Public'], ['allow_team_building', 'allowTeamBuilding', 'Team building'], ['registration_open', 'registrationOpen', 'Registration open'], ['team_selection_open', 'teamSelectionOpen', 'Team selection open']] as const).map(([column, key, label]) => (
                    <label key={key} className="flex items-center gap-2">
                      <input type="checkbox" checked={season[column] === true} disabled={busy} onChange={(e) => patchSeason(season.id, { [key]: e.target.checked }, `${label} updated.`)} />{label}
                    </label>
                  ))}
                  <label className="flex items-center gap-2">Status
                    <select className="rounded border border-gray-300 px-2 py-1" value={season.status} disabled={busy} onChange={(e) => patchSeason(season.id, { status: e.target.value }, 'Status updated.')}>
                      {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                  {!season.is_current && <Button size="sm" variant="secondary" disabled={busy} onClick={() => patchSeason(season.id, { isCurrent: true }, 'Current season updated.')}>Set as current</Button>}
                </div>
                <div className="text-xs text-gray-500 font-body">
                  Enabled grades: {sourcesFor(season.id).filter((source) => source.enabled).map((source) => source.grade_name).join(', ') || 'none yet'}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => openGrades(season.id)}>Map PlayHQ grades</Button>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => loadJobs(season.id)}>View import jobs</Button>
                  <Button size="sm" disabled={busy || !season.playhq_season_id} onClick={() => syncAction(season.id, { action: 'start', seasonId: season.id }, 'Import started; continue batches until complete.')}>Start PlayHQ import</Button>
                  {latestJob && !['completed', 'cancelled'].includes(latestJob.status) && (
                    <Button size="sm" disabled={busy} onClick={() => syncAction(season.id, { action: 'continue', jobId: latestJob.id }, 'Processed the next batch.')}>Continue import</Button>
                  )}
                  {latestJob && latestJob.failed_games > 0 && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => syncAction(season.id, { action: 'retry_failed', jobId: latestJob.id }, 'Failed games requeued.')}>Retry failures</Button>
                  )}
                </div>
                {gradePanel && gradePanel.seasonId === season.id && (
                  <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                    <p className="text-sm font-body font-semibold text-gray-800">PlayHQ grades for this season</p>
                    {gradePanel.error && <p className="text-sm text-red-600 font-body">{gradePanel.error}</p>}
                    {!gradePanel.playhqGrades.length && !gradePanel.error && <p className="text-sm text-gray-500 font-body">No PlayHQ grades returned. Link a PlayHQ season id first.</p>}
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
                  <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                    <p className="text-sm font-body font-semibold text-gray-800">Import jobs</p>
                    {jobs.map((job: any) => (
                      <div key={job.id} className="text-xs font-body text-gray-600 border-b border-gray-100 pb-2">
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

      <Card className="mt-6">
        <CardContent className="p-5 space-y-3">
          <h2 className="text-lg font-display font-bold text-gray-900">Add a season</h2>
          <div className="flex flex-wrap gap-2 items-center">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => load(true)}>Discover PlayHQ seasons</Button>
            {playhqError && <span className="text-sm text-red-600 font-body">{playhqError}</span>}
          </div>
          {playhqSeasons.length > 0 && (
            <div className="space-y-1">
              {playhqSeasons.map((season: any) => (
                <button key={season.id} type="button" className="block text-left text-sm font-body text-maroon-700 hover:underline" onClick={() => setForm({ ...form, name: `NDCC Fantasy ${season.name}`, slug: season.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), playhqSeasonId: season.id, startDate: season.startDate?.slice(0, 10) || '', endDate: season.endDate?.slice(0, 10) || '' })}>
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
              <select className="rounded border border-gray-300 px-2 py-2" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
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
