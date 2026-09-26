'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card, { CardContent } from '@/components/ui/Card';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';

type SavedSeason = { playhqSeasonId: string; label: string | null; enabled: boolean };
type SavedGrade = { playhqGradeId: string; gradeName: string; enabled: boolean };
type SavedTeam = { playhqTeamId: string; teamName: string; playhqGradeId: string | null; enabled: boolean };
type CmsTeam = { id: string; name: string; grade: string | null; isActive: boolean; playhqTeamId: string | null };
type MappingsResponse = {
  clubSeason: { id: string; name: string; slug: string } | null;
  mappings: { seasons: SavedSeason[]; grades: SavedGrade[]; teams: SavedTeam[] };
  cmsTeams: CmsTeam[];
  schema: { seasonLinks: boolean; teamLinkColumn: boolean };
};
type DiscoveredSeason = { id: string; name: string; startDate?: string | null; endDate?: string | null; competitionName?: string | null; current: boolean };
type DiscoveredTeam = { id: string; name: string; gradeId: string | null; gradeName: string | null };
type DiscoverResponse = {
  seasons: DiscoveredSeason[];
  selectedSeasonIds: string[];
  details: Array<{ seasonId: string; clubTeams: DiscoveredTeam[]; grades: Array<{ id: string; name: string; hasClubTeam: boolean }>; errors: string[] }>;
};

const UNALLOCATED = 'Grade not yet allocated by GCA';

function seasonLabel(season: Pick<DiscoveredSeason, 'name' | 'competitionName'>) {
  return season.competitionName ? `${season.name} - ${season.competitionName}` : season.name;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Melbourne' });
}

export default function AdminSeasonPlayHQPage() {
  const [data, setData] = useState<MappingsResponse | null>(null);
  const [discovery, setDiscovery] = useState<DiscoverResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Ticked selections, keyed by full PlayHQ UUID.
  const [seasons, setSeasons] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [teams, setTeams] = useState<Record<string, { name: string; gradeId: string | null }>>({});
  const [cmsLinks, setCmsLinks] = useState<Record<string, string>>({});
  const [seasonPicker, setSeasonPicker] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await parseApiResponse<MappingsResponse>(await adminFetch('/api/admin/playhq/mappings', { cache: 'no-store' }));
      setData(result);
      setSeasons(Object.fromEntries(result.mappings.seasons.filter((row) => row.enabled).map((row) => [row.playhqSeasonId, row.label || row.playhqSeasonId])));
      setGrades(Object.fromEntries(result.mappings.grades.filter((row) => row.enabled).map((row) => [row.playhqGradeId, row.gradeName])));
      setTeams(Object.fromEntries(result.mappings.teams.filter((row) => row.enabled).map((row) => [row.playhqTeamId, { name: row.teamName, gradeId: row.playhqGradeId }])));
      setCmsLinks(Object.fromEntries(result.cmsTeams.map((team) => [team.id, team.playhqTeamId || ''])));
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Could not load PlayHQ links.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const hasSaved = Boolean(data && (data.mappings.seasons.length || data.mappings.grades.length || data.mappings.teams.length));

  async function discover(seasonIds?: string[]) {
    setDiscovering(true);
    setFeedback(null);
    try {
      const query = seasonIds?.length ? `?seasonIds=${encodeURIComponent(seasonIds.join(','))}` : '';
      const result = await parseApiResponse<DiscoverResponse>(await adminFetch(`/api/admin/playhq/discover${query}`, { cache: 'no-store' }));
      setDiscovery(result);
      setSeasonPicker(Object.fromEntries(result.seasons.map((season) => [season.id, result.selectedSeasonIds.includes(season.id)])));
      // Nothing saved yet: pre-tick what automatic discovery would use, so a
      // first save reproduces the current public feed.
      if (!hasSaved) {
        const byId = new Map(result.seasons.map((season) => [season.id, season]));
        setSeasons(Object.fromEntries(result.details.filter((detail) => detail.clubTeams.length).map((detail) => [detail.seasonId, byId.get(detail.seasonId) ? seasonLabel(byId.get(detail.seasonId) as DiscoveredSeason) : detail.seasonId])));
        setGrades(Object.fromEntries(result.details.flatMap((detail) => detail.grades.filter((grade) => grade.hasClubTeam).map((grade) => [grade.id, grade.name]))));
        setTeams(Object.fromEntries(result.details.flatMap((detail) => detail.clubTeams.map((team) => [team.id, { name: team.name, gradeId: team.gradeId }]))));
      }
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'PlayHQ discovery failed.' });
    } finally {
      setDiscovering(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setFeedback(null);
    try {
      const result = await parseApiResponse<{ message?: string }>(await adminFetch('/api/admin/playhq/sync', { method: 'POST' }));
      setFeedback({ type: 'success', message: result.message || 'PlayHQ refresh requested.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'PlayHQ refresh failed.' });
    } finally {
      setRefreshing(false);
    }
  }

  async function save(clearAll = false) {
    if (!data) return;
    setSaving(true);
    setFeedback(null);
    try {
      const body = clearAll
        ? { seasons: [], grades: [], teams: [], cmsTeamLinks: data.schema.teamLinkColumn ? data.cmsTeams.map((team) => ({ teamId: team.id, playhqTeamId: null })) : [] }
        : {
          seasons: Object.entries(seasons).map(([playhqSeasonId, label]) => ({ playhqSeasonId, label, enabled: true })),
          grades: Object.entries(grades).map(([playhqGradeId, gradeName]) => ({ playhqGradeId, gradeName, enabled: true })),
          teams: Object.entries(teams).map(([playhqTeamId, team]) => ({ playhqTeamId, teamName: team.name, playhqGradeId: team.gradeId, enabled: true })),
          cmsTeamLinks: data.schema.teamLinkColumn ? data.cmsTeams.map((team) => ({ teamId: team.id, playhqTeamId: cmsLinks[team.id] || null })) : [],
        };
      const result = await parseApiResponse<{ message?: string; warnings?: string[] }>(await adminFetch('/api/admin/playhq/mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));
      await load();
      setFeedback({ type: 'success', message: [clearAll ? 'All PlayHQ links cleared. Automatic discovery is back on.' : result.message, ...(result.warnings || [])].filter(Boolean).join(' ') });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Could not save PlayHQ links.' });
    } finally {
      setSaving(false);
    }
  }

  const seasonById = useMemo(() => new Map((discovery?.seasons || []).map((season) => [season.id, season])), [discovery]);

  // PlayHQ teams available for CMS links: discovered club teams plus saved ones.
  const linkableTeams = useMemo(() => {
    const map = new Map<string, string>();
    for (const [id, team] of Object.entries(teams)) map.set(id, team.name);
    for (const detail of discovery?.details || []) for (const team of detail.clubTeams) map.set(team.id, team.name);
    for (const team of data?.cmsTeams || []) if (team.playhqTeamId && !map.has(team.playhqTeamId)) map.set(team.playhqTeamId, team.playhqTeamId);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [teams, discovery, data]);

  const toggle = <T,>(setter: React.Dispatch<React.SetStateAction<Record<string, T>>>, id: string, value: T) => (checked: boolean) => {
    setter((prev) => {
      const next = { ...prev };
      if (checked) next[id] = value; else delete next[id];
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-display font-bold text-content-primary">
            <Trophy className="h-6 w-6 text-maroon-700 dark:text-maroon-200" aria-hidden="true" />
            PlayHQ links
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-content-muted font-body">
            Choose which PlayHQ seasons, grades and teams feed the public Fixtures and team pages{data?.clubSeason ? ` for ${data.clubSeason.name}` : ''}.
            Until links are saved the site finds NDCC teams automatically. Full PlayHQ ids are stored; the API key stays on the server.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => discover()} isLoading={discovering} disabled={loading}>Discover from PlayHQ</Button>
          <Button type="button" size="sm" onClick={refresh} isLoading={refreshing}>Refresh PlayHQ now</Button>
        </div>
      </div>

      {feedback && (
        <p role="status" className={`rounded-lg border p-3 text-sm ${feedback.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>{feedback.message}</p>
      )}

      {data && (!data.schema.seasonLinks || !data.schema.teamLinkColumn) && (
        <p className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
          The database update 20260927070000_playhq_season_links.sql has not been applied yet.
          {!data.schema.seasonLinks && ' Linked seasons cannot be saved.'}
          {!data.schema.teamLinkColumn && ' CMS team links cannot be saved.'}
          {' '}Grade and team links still work.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-content-muted">Loading PlayHQ links...</p>
      ) : !data?.clubSeason ? (
        <Card><CardContent><p className="text-sm text-content-secondary">Set a current club season in <Link className="font-semibold text-maroon-700 underline dark:text-maroon-200" href="/admin/season/new">Start New Season</Link> before linking PlayHQ.</p></CardContent></Card>
      ) : (
        <>
          <Card><CardContent className="space-y-3">
            <h2 className="text-lg font-display font-bold text-content-primary">Currently saved</h2>
            {hasSaved ? (
              <ul className="space-y-1 text-sm text-content-secondary">
                <li><span className="font-semibold text-content-primary">Seasons:</span> {data.mappings.seasons.length ? data.mappings.seasons.map((row) => row.label || row.playhqSeasonId).join('; ') : 'Automatic'}</li>
                <li><span className="font-semibold text-content-primary">Grades:</span> {data.mappings.grades.length ? data.mappings.grades.map((row) => row.gradeName).join('; ') : 'From linked teams'}</li>
                <li><span className="font-semibold text-content-primary">Teams:</span> {data.mappings.teams.length ? data.mappings.teams.map((row) => row.teamName).join('; ') : 'Automatic'}</li>
              </ul>
            ) : (
              <p className="text-sm text-content-secondary">No PlayHQ links saved. Public pages use automatic discovery. Use Discover from PlayHQ to review and save links.</p>
            )}
          </CardContent></Card>

          {discovery && (
            <>
              <Card><CardContent className="space-y-4">
                <div>
                  <h2 className="text-lg font-display font-bold text-content-primary">PlayHQ seasons</h2>
                  <p className="text-sm text-content-muted">Tick the seasons to inspect, then load their grades and teams. Current-year seasons are listed first.</p>
                </div>
                <fieldset className="grid gap-2 md:grid-cols-2">
                  <legend className="sr-only">PlayHQ seasons to inspect</legend>
                  {discovery.seasons.map((season) => (
                    <label key={season.id} className="flex items-start gap-2 rounded-lg border border-edge-subtle p-3 text-sm">
                      <input type="checkbox" className="mt-1" checked={Boolean(seasonPicker[season.id])} onChange={(event) => setSeasonPicker((prev) => ({ ...prev, [season.id]: event.target.checked }))} />
                      <span>
                        <span className="font-semibold text-content-primary">{seasonLabel(season)}</span>
                        {season.current && <span className="ml-2 rounded bg-maroon-50 px-1.5 py-0.5 text-sm font-semibold text-maroon-800 dark:bg-maroon-950 dark:text-maroon-100">Current</span>}
                        <span className="block tabular-nums text-content-muted">{[formatDate(season.startDate), formatDate(season.endDate)].filter(Boolean).join(' to ')}</span>
                        <span className="block break-all font-mono text-content-muted">{season.id}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <Button type="button" variant="secondary" size="sm" isLoading={discovering} onClick={() => discover(Object.entries(seasonPicker).filter(([, on]) => on).map(([id]) => id))}>Load grades and teams for ticked seasons</Button>
              </CardContent></Card>

              {discovery.details.map((detail) => {
                const season = seasonById.get(detail.seasonId);
                const label = season ? seasonLabel(season) : detail.seasonId;
                return (
                  <Card key={detail.seasonId}><CardContent className="space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className="text-lg font-display font-bold text-content-primary">{label}</h2>
                        <p className="break-all font-mono text-sm text-content-muted">{detail.seasonId}</p>
                      </div>
                      <label className="flex items-center gap-2 text-sm font-semibold text-content-primary">
                        <input type="checkbox" checked={detail.seasonId in seasons} disabled={!data.schema.seasonLinks} onChange={(event) => toggle(setSeasons, detail.seasonId, label)(event.target.checked)} />
                        Link this season
                      </label>
                    </div>
                    {detail.errors.map((error) => <p key={error} className="text-sm text-red-700">{error}</p>)}
                    <div className="grid gap-6 lg:grid-cols-2">
                      <fieldset>
                        <legend className="mb-2 text-sm font-semibold text-content-primary">NDCC teams</legend>
                        {detail.clubTeams.length === 0 ? <p className="text-sm text-content-muted">No NDCC teams in this season.</p> : (
                          <ul className="space-y-2">
                            {detail.clubTeams.map((team) => (
                              <li key={team.id}>
                                <label className="flex items-start gap-2 text-sm">
                                  <input type="checkbox" className="mt-1" checked={team.id in teams} onChange={(event) => toggle(setTeams, team.id, { name: team.name, gradeId: team.gradeId })(event.target.checked)} />
                                  <span>
                                    <span className="font-semibold text-content-primary">{team.name}</span>
                                    <span className="block text-content-secondary">{team.gradeName || UNALLOCATED}</span>
                                    <span className="block break-all font-mono text-content-muted">{team.id}</span>
                                  </span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        )}
                      </fieldset>
                      <fieldset>
                        <legend className="mb-2 text-sm font-semibold text-content-primary">Grades</legend>
                        {detail.grades.length === 0 ? <p className="text-sm text-content-muted">No grades published for this season yet.</p> : (
                          <ul className="max-h-96 space-y-2 overflow-y-auto pr-2">
                            {detail.grades.map((grade) => (
                              <li key={grade.id}>
                                <label className="flex items-start gap-2 text-sm">
                                  <input type="checkbox" className="mt-1" checked={grade.id in grades} onChange={(event) => toggle(setGrades, grade.id, grade.name)(event.target.checked)} />
                                  <span>
                                    <span className="font-semibold text-content-primary">{grade.name}</span>
                                    {grade.hasClubTeam && <span className="ml-2 text-content-secondary">(NDCC team entered)</span>}
                                    <span className="block break-all font-mono text-content-muted">{grade.id}</span>
                                  </span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        )}
                      </fieldset>
                    </div>
                  </CardContent></Card>
                );
              })}
            </>
          )}

          <Card><CardContent className="space-y-4">
            <div>
              <h2 className="text-lg font-display font-bold text-content-primary">Website team cards</h2>
              <p className="text-sm text-content-muted">Link each team card from <Link className="font-semibold text-maroon-700 underline dark:text-maroon-200" href="/admin/teams">Teams</Link> to its PlayHQ team. Unlinked cards are matched by name where the match is unambiguous.</p>
            </div>
            {data.cmsTeams.length === 0 ? <p className="text-sm text-content-muted">No team cards yet.</p> : (
              <div className="space-y-3">
                {data.cmsTeams.map((team) => (
                  <div key={team.id} className="grid gap-2 sm:grid-cols-[1fr_1.4fr] sm:items-center">
                    <label htmlFor={`cms-link-${team.id}`} className="text-sm">
                      <span className="font-semibold text-content-primary">{team.name}</span>
                      {team.grade && <span className="text-content-secondary"> ({team.grade})</span>}
                      {!team.isActive && <span className="text-content-muted"> - hidden</span>}
                    </label>
                    <select
                      id={`cms-link-${team.id}`}
                      value={cmsLinks[team.id] || ''}
                      disabled={!data.schema.teamLinkColumn}
                      onChange={(event) => setCmsLinks((prev) => ({ ...prev, [team.id]: event.target.value }))}
                      className="w-full rounded-lg border border-edge-strong bg-surface-card px-3 py-2 text-sm"
                    >
                      <option value="">Not linked (match by name)</option>
                      {linkableTeams.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => save(false)} isLoading={saving}>Save PlayHQ links</Button>
            {hasSaved && <Button type="button" variant="ghost" onClick={() => save(true)} disabled={saving}>Clear all links (use automatic discovery)</Button>}
            <Link href="/admin/playhq-diagnostics" className="self-center text-sm font-semibold text-maroon-700 underline dark:text-maroon-200">PlayHQ diagnostics</Link>
          </div>
        </>
      )}
    </div>
  );
}
