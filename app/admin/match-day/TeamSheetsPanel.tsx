'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import {
  type PlayerDirectoryEntry, type TeamSheet, type TeamSheetPlayer,
  TEAM_SHEET_TEMPLATE, formatClubDate, matchFantasyPlayer, normaliseTeamSheet, parsePlayerEntry,
  parseTeamSheetImport, validateTeamSheet,
} from '@/lib/match-day';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import BatchActionsBar from '@/components/admin/BatchActionsBar';
import ImageUploadField from '@/components/admin/ImageUploadField';
import AdminSkeleton from '@/components/admin/AdminSkeleton';
import BulkImport from './BulkImport';

const endpoint = '/api/admin/match-day/team-sheets';
type Team = { id: string; name: string; grade: string | null; is_active: boolean };
type Directory = { teams: Team[]; players: PlayerDirectoryEntry[] };
type Form = Omit<ReturnType<typeof normaliseTeamSheet>, 'players'> & { playersText: string; links: Record<string, string> };

const emptyForm: Form = { team_id: null, team_name: '', match_date: '', round_label: '', season_label: '', opponent: '', venue: '', start_time: '', notes: '', document_url: '', published: true, playersText: '', links: {} };

function playersToText(players: TeamSheetPlayer[]) {
  return players.map((player) => `${player.name}${player.captain ? ' (c)' : ''}${player.wicketkeeper ? ' (wk)' : ''}${player.twelfth ? ' (12th)' : ''}`).join('\n');
}

function playersFromForm(form: Form, directory: PlayerDirectoryEntry[]): TeamSheetPlayer[] {
  return form.playersText.split('\n').map(parsePlayerEntry).filter((player) => player.name).map((player) => {
    const chosen = form.links[player.name.toLowerCase()];
    return { ...player, fantasy_player_id: chosen === 'none' ? null : chosen || matchFantasyPlayer(player.name, directory) };
  });
}

export default function TeamSheetsPanel() {
  const [rows, setRows] = useState<TeamSheet[]>([]);
  const [directory, setDirectory] = useState<Directory>({ teams: [], players: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const [sheets, lists] = await Promise.all([
        parseApiResponse<{ data: TeamSheet[] }>(await adminFetch(endpoint, { cache: 'no-store' })),
        parseApiResponse<Directory>(await adminFetch('/api/admin/match-day/directory', { cache: 'no-store' })),
      ]);
      setRows(sheets.data); setDirectory({ teams: lists.teams, players: lists.players });
    } catch (reason) { setLoadError(reason instanceof Error ? reason.message : 'Unable to load team sheets.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const previewPlayers = useMemo(() => playersFromForm(form, directory.players), [form, directory.players]);

  function startNew(copyFrom?: TeamSheet) {
    setEditId(null); setFormError('');
    setForm(copyFrom
      ? { ...emptyForm, team_id: copyFrom.team_id, team_name: copyFrom.team_name, season_label: copyFrom.season_label, start_time: copyFrom.start_time, playersText: playersToText(copyFrom.players) }
      : emptyForm);
    setOpen(true);
  }

  function startEdit(sheet: TeamSheet) {
    setEditId(sheet.id); setFormError('');
    const links = Object.fromEntries(sheet.players.map((player) => [player.name.toLowerCase(), player.fantasy_player_id || 'none']));
    setForm({ ...emptyForm, ...sheet, playersText: playersToText(sheet.players), links });
    setOpen(true);
  }

  async function save() {
    if (busy || uploading) return;
    const payload = normaliseTeamSheet({ ...form, players: previewPlayers });
    const problem = validateTeamSheet(payload);
    if (problem) { setFormError(problem); return; }
    setBusy(true); setFormError('');
    try {
      await parseApiResponse(await adminFetch(endpoint, { method: editId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editId ? { id: editId, ...payload } : payload) }));
      setOpen(false);
      setMessage(payload.published ? `${payload.team_name} team sheet published on This Week and the team page.` : `${payload.team_name} team sheet saved as a draft (not public).`);
      await load();
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Unable to save the team sheet.'); }
    finally { setBusy(false); }
  }

  async function setPublished(ids: string[], published: boolean) {
    setBusy(true); setMessage('');
    try {
      const result = await parseApiResponse<{ updated: number }>(await adminFetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, published }) }));
      setMessage(`${result.updated} team sheet${result.updated === 1 ? '' : 's'} ${published ? 'published' : 'hidden'}.`);
      setSelected(new Set()); await load();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to update.'); }
    finally { setBusy(false); }
  }

  async function remove(sheet: TeamSheet) {
    if (!window.confirm(`Delete the ${sheet.team_name} team sheet for ${formatClubDate(sheet.match_date)}? This cannot be undone.`)) return;
    setBusy(true); setMessage('');
    try {
      await parseApiResponse(await adminFetch(`${endpoint}?id=${sheet.id}`, { method: 'DELETE' }));
      setMessage('Team sheet deleted.'); await load();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to delete.'); }
    finally { setBusy(false); }
  }

  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const teamOptions = directory.teams.filter((team) => team.is_active || team.id === form.team_id);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-2xl text-sm text-content-secondary">Publish each side&apos;s team for the round. Players linked to Dino Coach show as &quot;Named&quot; when participants pick their squads. Published sheets appear on <a className="underline" href="/this-week" target="_blank" rel="noreferrer">This Week</a> and each team page.</p>
      <Button onClick={() => startNew()}>Add team sheet</Button>
    </div>
    {message && <p role="status" className="text-sm font-semibold text-status-success">{message}</p>}
    <BatchActionsBar selectedCount={selected.size} itemLabel="team sheet" busy={busy} onClearSelection={() => setSelected(new Set())} actions={[
      { key: 'publish', label: 'Publish', onAction: () => setPublished([...selected], true) },
      { key: 'hide', label: 'Hide', variant: 'secondary', onAction: () => setPublished([...selected], false) },
    ]} />
    {loading ? <AdminSkeleton lines={4} /> : loadError ? <div role="alert" className="text-status-error">{loadError} <button type="button" className="underline" onClick={() => void load()}>Retry</button></div>
      : rows.length === 0 ? <p className="rounded-xl border border-dashed border-edge-strong p-6 text-center text-content-muted">No team sheets yet. Add one, or import a whole round below.</p>
      : <div className="overflow-x-auto rounded-xl border border-edge-subtle">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="bg-surface-muted text-content-secondary"><tr>
            <th className="p-3"><span className="sr-only">Select</span></th><th className="p-3">Date</th><th className="p-3">Team</th><th className="p-3">Round / opponent</th><th className="p-3">Players</th><th className="p-3">Status</th><th className="p-3"><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody className="divide-y divide-edge-subtle">{rows.map((sheet) => {
            const linked = sheet.players.filter((player) => player.fantasy_player_id).length;
            return <tr key={sheet.id} className="text-content-primary">
              <td className="p-3"><input type="checkbox" className="h-4 w-4" checked={selected.has(sheet.id)} onChange={() => toggle(sheet.id)} aria-label={`Select ${sheet.team_name} ${sheet.match_date}`} /></td>
              <td className="p-3 whitespace-nowrap">{formatClubDate(sheet.match_date)}</td>
              <td className="p-3 font-semibold">{sheet.team_name}</td>
              <td className="p-3">{[sheet.round_label, sheet.opponent && `v ${sheet.opponent}`].filter(Boolean).join(' · ') || '—'}</td>
              <td className="p-3">{sheet.players.length}<span className="block text-xs text-content-muted">{linked} linked to Dino Coach</span></td>
              <td className="p-3">{sheet.published ? <span className="font-semibold text-status-success">Published</span> : <span className="text-content-muted">Draft</span>}</td>
              <td className="p-3"><div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => startEdit(sheet)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => startNew(sheet)}>Copy to next round</Button>
                <Button size="sm" variant="ghost" onClick={() => void setPublished([sheet.id], !sheet.published)} disabled={busy}>{sheet.published ? 'Hide' : 'Publish'}</Button>
                <Button size="sm" variant="danger" disabled={busy} onClick={() => void remove(sheet)}>Delete</Button>
              </div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>}

    <BulkImport<ReturnType<typeof normaliseTeamSheet>>
      title="Import a round of team sheets"
      templateName="team-sheets-template.csv"
      template={TEAM_SHEET_TEMPLATE}
      help={<>One row per player with the columns <strong>team, date, player</strong> (round, season, opponent, venue and start_time are optional). Add <strong>(c)</strong>, <strong>(wk)</strong> or <strong>(12th)</strong> after a name. A team and date that already has a sheet is replaced.</>}
      parse={(text) => { const result = parseTeamSheetImport(text, directory.players); return { items: result.sheets, issues: result.issues }; }}
      renderPreview={(sheets) => <ul className="grid gap-3 md:grid-cols-2">{sheets.map((sheet) => <li key={`${sheet.team_name}-${sheet.match_date}`} className="rounded-lg border border-edge-subtle p-3 text-sm">
        <p className="font-semibold text-content-primary">{sheet.team_name} · {formatClubDate(sheet.match_date)}</p>
        <p className="text-content-secondary">{[sheet.round_label, sheet.opponent && `v ${sheet.opponent}`, sheet.venue].filter(Boolean).join(' · ')}</p>
        <p className="mt-1 text-content-secondary">{sheet.players.length} players, {sheet.players.filter((player) => player.fantasy_player_id).length} linked to Dino Coach</p>
        {sheet.players.some((player) => !player.fantasy_player_id && !player.twelfth) && <p className="mt-1 text-xs text-status-warning">Not linked: {sheet.players.filter((player) => !player.fantasy_player_id && !player.twelfth).map((player) => player.name).join(', ')}. Edit the sheet after import to link them.</p>}
      </li>)}</ul>}
      onImport={async (sheets, publish) => {
        const result = await parseApiResponse<{ created: number; updated: number }>(await adminFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: sheets, publish }) }));
        await load();
        return `Imported ${result.created} new and replaced ${result.updated} team sheet${result.created + result.updated === 1 ? '' : 's'}${publish ? ' (published)' : ' as drafts'}.`;
      }}
    />

    <Modal isOpen={open} onClose={() => setOpen(false)} title={editId ? 'Edit team sheet' : 'Add team sheet'} size="xl">
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="sheet-team" className="form-label">Team</label>
            <select id="sheet-team" className="form-input w-full" value={form.team_id || ''} onChange={(event) => {
              const team = directory.teams.find((item) => item.id === event.target.value);
              setForm({ ...form, team_id: team?.id || null, team_name: team ? team.name : form.team_name });
            }}>
              <option value="">Another team (type its name)</option>
              {teamOptions.map((team) => <option key={team.id} value={team.id}>{team.name}{team.grade ? ` (${team.grade})` : ''}</option>)}
            </select>
            {!form.team_id && <div className="mt-3"><Input id="sheet-team-name" label="Team name" value={form.team_name} onChange={(event) => setForm({ ...form, team_name: event.target.value })} /></div>}
          </div>
          <Input id="sheet-date" label="Match date" type="date" required value={form.match_date} onChange={(event) => setForm({ ...form, match_date: event.target.value })} />
          <Input id="sheet-round" label="Round (optional)" placeholder="e.g. Round 3" value={form.round_label} onChange={(event) => setForm({ ...form, round_label: event.target.value })} />
          <Input id="sheet-season" label="Season (optional)" placeholder="e.g. 2026/27" value={form.season_label} onChange={(event) => setForm({ ...form, season_label: event.target.value })} />
          <Input id="sheet-opponent" label="Opponent (optional)" value={form.opponent} onChange={(event) => setForm({ ...form, opponent: event.target.value })} />
          <Input id="sheet-venue" label="Venue (optional)" value={form.venue} onChange={(event) => setForm({ ...form, venue: event.target.value })} />
          <Input id="sheet-start" label="Start time (optional)" placeholder="e.g. 12:30 pm" value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} />
        </div>
        <div>
          <label htmlFor="sheet-players" className="form-label">Players, one per line (add (c), (wk) or (12th) after a name)</label>
          <textarea id="sheet-players" className="form-input min-h-48 w-full" value={form.playersText} onChange={(event) => setForm({ ...form, playersText: event.target.value })} />
        </div>
        {previewPlayers.length > 0 && directory.players.length > 0 && <fieldset className="rounded-lg border border-edge-subtle p-3">
          <legend className="px-1 text-sm font-semibold text-content-primary">Dino Coach link</legend>
          <p className="mb-2 text-xs text-content-muted">Exact name matches are linked automatically. Choose the Dino Coach player for anyone not matched, or leave as not linked.</p>
          <ul className="grid gap-2 md:grid-cols-2">{previewPlayers.map((player) => <li key={player.name} className="flex items-center gap-2 text-sm">
            <span className="w-40 shrink-0 truncate text-content-primary">{player.name}</span>
            <select aria-label={`Dino Coach player for ${player.name}`} className="form-input min-w-0 flex-1 py-1 text-sm" value={player.fantasy_player_id || 'none'}
              onChange={(event) => setForm({ ...form, links: { ...form.links, [player.name.toLowerCase()]: event.target.value } })}>
              <option value="none">Not linked</option>
              {directory.players.map((option) => <option key={option.id} value={option.id}>{option.display_name}</option>)}
            </select>
          </li>)}</ul>
        </fieldset>}
        <div>
          <label htmlFor="sheet-notes" className="form-label">Notes (optional, shown publicly)</label>
          <textarea id="sheet-notes" className="form-input min-h-20 w-full" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </div>
        <ImageUploadField id="sheet-file" label="Team sheet PDF (optional)" variant="pdf" value={form.document_url} onChange={(value) => setForm({ ...form, document_url: value })} onUploadingChange={setUploading} />
        <label className="flex min-h-11 items-center gap-3 text-content-primary"><input type="checkbox" className="h-4 w-4" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} /> Publish now (untick to save as a draft)</label>
        {formError && <p role="alert" className="text-sm text-status-error">{formError}</p>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" isLoading={busy} disabled={uploading}>{form.published ? 'Save and publish' : 'Save draft'}</Button>
        </div>
      </form>
    </Modal>
  </div>;
}
