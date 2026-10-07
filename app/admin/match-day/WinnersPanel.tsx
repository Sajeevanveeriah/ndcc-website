'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import {
  type ClubWinner, type WinnerCategory, WINNER_CATEGORIES, WINNER_CATEGORY_LABELS, WINNER_TEMPLATE,
  formatClubDate, normaliseWinner, parseWinnerImport, publicWinnerName, validateWinner,
} from '@/lib/match-day';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import BatchActionsBar from '@/components/admin/BatchActionsBar';
import ImageUploadField from '@/components/admin/ImageUploadField';
import AdminSkeleton from '@/components/admin/AdminSkeleton';
import BulkImport from './BulkImport';

const endpoint = '/api/admin/match-day/winners';
type Sponsor = { id: string; player_name: string; sponsor_name: string; active: boolean };
type Form = ReturnType<typeof normaliseWinner>;
const emptyForm = (category: WinnerCategory = 'player_sponsor_award'): Form => ({
  category, title: '', winner_name: '', show_full_name: false, prize: '', details: '', draw_date: '', round_label: '', season_label: '',
  player_sponsor_id: null, sponsor_name: '', image_url: '', image_alt: '', published: true, sort_order: 0,
});

const TITLE_HINTS: Record<WinnerCategory, string> = {
  player_sponsor_award: 'Round 3 Player of the Match',
  dino_lotto: 'Dino Lotto week 4',
  raffle: 'Trailer raffle first prize',
  event: 'Trivia night lucky door prize',
  other: 'Club championship',
};

export default function WinnersPanel() {
  const [rows, setRows] = useState<ClubWinner[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [filter, setFilter] = useState<WinnerCategory | ''>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const [winners, lists] = await Promise.all([
        parseApiResponse<{ data: ClubWinner[] }>(await adminFetch(endpoint, { cache: 'no-store' })),
        parseApiResponse<{ sponsors: Sponsor[] }>(await adminFetch('/api/admin/match-day/directory', { cache: 'no-store' })),
      ]);
      setRows(winners.data); setSponsors(lists.sponsors);
    } catch (reason) { setLoadError(reason instanceof Error ? reason.message : 'Unable to load winners.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function startNew(category?: WinnerCategory) { setEditId(null); setFormError(''); setForm(emptyForm(category || filter || 'player_sponsor_award')); setOpen(true); }
  function startEdit(winner: ClubWinner) { setEditId(winner.id); setFormError(''); setForm({ ...emptyForm(), ...winner }); setOpen(true); }

  async function save(addAnother = false) {
    if (busy || uploading) return;
    const payload = normaliseWinner(form as unknown as Record<string, unknown>);
    const problem = validateWinner(payload);
    if (problem) { setFormError(problem); return; }
    setBusy(true); setFormError('');
    try {
      await parseApiResponse(await adminFetch(endpoint, { method: editId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editId ? { id: editId, ...payload } : payload) }));
      setMessage(payload.published ? `Saved and published: ${payload.title} - ${publicWinnerName(payload)}.` : `Saved as a draft: ${payload.title}.`);
      if (addAnother) {
        // Keep the category, date, round and season for the next winner from the same draw.
        setForm({ ...emptyForm(payload.category), draw_date: payload.draw_date, round_label: payload.round_label, season_label: payload.season_label, published: payload.published });
        setEditId(null);
      } else setOpen(false);
      await load();
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Unable to save the winner.'); }
    finally { setBusy(false); }
  }

  async function setPublished(ids: string[], published: boolean) {
    setBusy(true); setMessage('');
    try {
      const result = await parseApiResponse<{ updated: number }>(await adminFetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, published }) }));
      setMessage(`${result.updated} winner${result.updated === 1 ? '' : 's'} ${published ? 'published' : 'hidden'}.`);
      setSelected(new Set()); await load();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to update.'); }
    finally { setBusy(false); }
  }

  async function remove(winner: ClubWinner) {
    if (!window.confirm(`Delete "${winner.title}" (${winner.winner_name})? This cannot be undone.`)) return;
    setBusy(true); setMessage('');
    try {
      await parseApiResponse(await adminFetch(`${endpoint}?id=${winner.id}`, { method: 'DELETE' }));
      setMessage('Winner deleted.'); await load();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to delete.'); }
    finally { setBusy(false); }
  }

  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const shown = filter ? rows.filter((row) => row.category === filter) : rows;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-2xl text-sm text-content-secondary">Player sponsor awards, Dino Lotto, raffle, event and other winners. Published winners appear on <a className="underline" href="/winners" target="_blank" rel="noreferrer">Winners</a> and This Week. Names show as first name and surname initial unless you tick &quot;show full name&quot;.</p>
      <div className="flex flex-wrap gap-2">
        {WINNER_CATEGORIES.map((category) => <Button key={category} size="sm" variant="secondary" onClick={() => startNew(category)}>+ {WINNER_CATEGORY_LABELS[category]}</Button>)}
      </div>
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
      {[['', 'All'] as const, ...WINNER_CATEGORIES.map((category) => [category, WINNER_CATEGORY_LABELS[category]] as const)].map(([value, label]) =>
        <button key={value || 'all'} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
          className={`min-h-9 rounded-full border px-3 text-sm ${filter === value ? 'border-maroon-700 bg-maroon-700 text-white' : 'border-edge-strong text-content-primary hover:bg-surface-muted'}`}>{label}</button>)}
    </div>
    {message && <p role="status" className="text-sm font-semibold text-status-success">{message}</p>}
    <BatchActionsBar selectedCount={selected.size} itemLabel="winner" busy={busy} onClearSelection={() => setSelected(new Set())} actions={[
      { key: 'publish', label: 'Publish', onAction: () => setPublished([...selected], true) },
      { key: 'hide', label: 'Hide', variant: 'secondary', onAction: () => setPublished([...selected], false) },
    ]} />
    {loading ? <AdminSkeleton lines={4} /> : loadError ? <div role="alert" className="text-status-error">{loadError} <button type="button" className="underline" onClick={() => void load()}>Retry</button></div>
      : shown.length === 0 ? <p className="rounded-xl border border-dashed border-edge-strong p-6 text-center text-content-muted">No winners recorded{filter ? ` for ${WINNER_CATEGORY_LABELS[filter]}` : ''} yet.</p>
      : <div className="overflow-x-auto rounded-xl border border-edge-subtle">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="bg-surface-muted text-content-secondary"><tr>
            <th className="p-3"><span className="sr-only">Select</span></th><th className="p-3">Date</th><th className="p-3">Category</th><th className="p-3">Title</th><th className="p-3">Winner (public name)</th><th className="p-3">Status</th><th className="p-3"><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody className="divide-y divide-edge-subtle">{shown.map((winner) => <tr key={winner.id} className="text-content-primary">
            <td className="p-3"><input type="checkbox" className="h-4 w-4" checked={selected.has(winner.id)} onChange={() => toggle(winner.id)} aria-label={`Select ${winner.title}`} /></td>
            <td className="p-3 whitespace-nowrap">{formatClubDate(winner.draw_date)}</td>
            <td className="p-3">{WINNER_CATEGORY_LABELS[winner.category]}</td>
            <td className="p-3 font-semibold">{winner.title}{winner.prize && <span className="block text-xs font-normal text-content-muted">{winner.prize}</span>}</td>
            <td className="p-3">{winner.winner_name}<span className="block text-xs text-content-muted">Shown as {publicWinnerName(winner)}</span></td>
            <td className="p-3">{winner.published ? <span className="font-semibold text-status-success">Published</span> : <span className="text-content-muted">Draft</span>}</td>
            <td className="p-3"><div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => startEdit(winner)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => void setPublished([winner.id], !winner.published)} disabled={busy}>{winner.published ? 'Hide' : 'Publish'}</Button>
              <Button size="sm" variant="danger" onClick={() => void remove(winner)} disabled={busy}>Delete</Button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>}

    <BulkImport<Form>
      title="Import winners"
      templateName="winners-template.csv"
      template={WINNER_TEMPLATE}
      help={<>Columns <strong>category, title, winner, date</strong> are required (prize, details, round, season, sponsor and show_full_name are optional). Category can be Player sponsor award, Dino Lotto, Raffle, Event or Other. Use <strong>yes</strong> in show_full_name to show the full name publicly.</>}
      parse={(text) => { const result = parseWinnerImport(text); return { items: result.winners, issues: result.issues }; }}
      renderPreview={(winners) => <ul className="divide-y divide-edge-subtle rounded-lg border border-edge-subtle text-sm">{winners.slice(0, 50).map((winner, index) => <li key={index} className="flex flex-wrap justify-between gap-2 p-2">
        <span className="text-content-primary"><strong>{winner.title}</strong> · {WINNER_CATEGORY_LABELS[winner.category]} · {formatClubDate(winner.draw_date)}</span>
        <span className="text-content-secondary">{publicWinnerName(winner)}{winner.prize ? ` · ${winner.prize}` : ''}</span>
      </li>)}{winners.length > 50 && <li className="p-2 text-content-muted">…and {winners.length - 50} more.</li>}</ul>}
      onImport={async (winners, publish) => {
        const result = await parseApiResponse<{ created: number }>(await adminFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: winners, publish }) }));
        await load();
        return `Imported ${result.created} winner${result.created === 1 ? '' : 's'}${publish ? ' (published)' : ' as drafts'}.`;
      }}
    />

    <Modal isOpen={open} onClose={() => setOpen(false)} title={editId ? 'Edit winner' : `Add ${WINNER_CATEGORY_LABELS[form.category] || 'winner'}`} size="lg">
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="winner-category" className="form-label">Category</label>
            <select id="winner-category" className="form-input w-full" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as WinnerCategory })}>
              {WINNER_CATEGORIES.map((category) => <option key={category} value={category}>{WINNER_CATEGORY_LABELS[category]}</option>)}
            </select>
          </div>
          <Input id="winner-date" label="Date" type="date" required value={form.draw_date} onChange={(event) => setForm({ ...form, draw_date: event.target.value })} />
          <Input id="winner-title" label="What was won" required placeholder={`e.g. ${TITLE_HINTS[form.category]}`} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <div>
            <Input id="winner-name" label="Winner's name" required value={form.winner_name} onChange={(event) => setForm({ ...form, winner_name: event.target.value })} />
            <label className="mt-2 flex items-center gap-2 text-sm text-content-primary"><input type="checkbox" className="h-4 w-4" checked={form.show_full_name} onChange={(event) => setForm({ ...form, show_full_name: event.target.checked })} /> Show full name publicly</label>
            {form.winner_name && <p className="mt-1 text-xs text-content-muted">Public name: {publicWinnerName(form)}</p>}
          </div>
          <Input id="winner-prize" label="Prize (optional)" value={form.prize} onChange={(event) => setForm({ ...form, prize: event.target.value })} />
          <Input id="winner-round" label="Round or week (optional)" value={form.round_label} onChange={(event) => setForm({ ...form, round_label: event.target.value })} />
          <Input id="winner-season" label="Season (optional)" placeholder="e.g. 2026/27" value={form.season_label} onChange={(event) => setForm({ ...form, season_label: event.target.value })} />
          {form.category === 'player_sponsor_award' && <div>
            <label htmlFor="winner-sponsor" className="form-label">Player sponsor (optional)</label>
            <select id="winner-sponsor" className="form-input w-full" value={form.player_sponsor_id || ''} onChange={(event) => {
              const sponsor = sponsors.find((item) => item.id === event.target.value);
              setForm({ ...form, player_sponsor_id: sponsor?.id || null, sponsor_name: sponsor ? sponsor.sponsor_name : form.sponsor_name });
            }}>
              <option value="">None or other (type below)</option>
              {sponsors.map((sponsor) => <option key={sponsor.id} value={sponsor.id}>{sponsor.sponsor_name} (sponsors {sponsor.player_name})</option>)}
            </select>
          </div>}
          <Input id="winner-sponsor-name" label="Sponsor name shown (optional)" value={form.sponsor_name} onChange={(event) => setForm({ ...form, sponsor_name: event.target.value })} />
        </div>
        <div>
          <label htmlFor="winner-details" className="form-label">Details (optional, for example the winning number)</label>
          <textarea id="winner-details" className="form-input min-h-20 w-full" value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} />
        </div>
        <ImageUploadField id="winner-photo" label="Photo (optional)" value={form.image_url} onChange={(value) => setForm({ ...form, image_url: value })} onUploadingChange={setUploading} />
        {form.image_url && <Input id="winner-alt" label="Photo description (alt text)" required value={form.image_alt} onChange={(event) => setForm({ ...form, image_alt: event.target.value })} />}
        <label className="flex min-h-11 items-center gap-3 text-content-primary"><input type="checkbox" className="h-4 w-4" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} /> Publish now (untick to save as a draft)</label>
        {formError && <p role="alert" className="text-sm text-status-error">{formError}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          {!editId && <Button type="button" variant="secondary" onClick={() => void save(true)} disabled={busy || uploading}>Save and add another</Button>}
          <Button type="submit" isLoading={busy} disabled={uploading}>{form.published ? 'Save and publish' : 'Save draft'}</Button>
        </div>
      </form>
    </Modal>
  </div>;
}
