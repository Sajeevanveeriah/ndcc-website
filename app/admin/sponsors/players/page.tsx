'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import { type PlayerSponsor, groupPlayerSponsors, normalisePlayerSponsor, validatePlayerSponsor } from '@/lib/player-sponsors';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import ImageUploadField from '@/components/admin/ImageUploadField';

const empty = { player_name: '', sponsor_name: '', player_image_url: '', logo_url: '', website: '', sort_order: 0, active: false };
const endpoint = '/api/admin/resources/playerSponsors';
const sort = (rows: PlayerSponsor[]) => [...rows].sort((a, b) => a.sort_order - b.sort_order || a.player_name.localeCompare(b.player_name));

export default function PlayerSponsorsPage() {
  const [rows, setRows] = useState<PlayerSponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const uploading = photoUploading || logoUploading;
  useEffect(() => {
    fetch(endpoint, { cache: 'no-store' }).then((response) => parseApiResponse<{ data: PlayerSponsor[] }>(response))
      .then((result) => setRows(sort(result.data))).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  async function save() {
    if (busy || uploading) return;
    const payload = normalisePlayerSponsor({ ...form, player_name: form.player_name.trim(), sponsor_name: form.sponsor_name.trim(), website: form.website.trim(), logo_url: form.logo_url.trim(), player_image_url: form.player_image_url.trim() });
    const validation = validatePlayerSponsor(payload, true);
    if (validation) { setError(validation); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await adminFetch(endpoint, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? { id, ...payload } : payload) });
      const result = await parseApiResponse<{ data: PlayerSponsor }>(response);
      setRows((previous) => sort(id ? previous.map((row) => row.id === id ? result.data : row) : [...previous, result.data]));
      setOpen(false); setMessage('Player sponsor saved. Active entries appear on the Player Sponsors page.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save player sponsor.'); }
    finally { setBusy(false); }
  }

  return <div>
    <Link href="/admin/sponsors" className="text-sm underline">Back to sponsors</Link>
    <div className="my-6 flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="font-display text-2xl font-bold">Player sponsors</h1><p className="mt-2 text-content-muted">Add each sponsor separately under the same player name. All visible sponsors appear together on one player card. Hide an entry to remove only that sponsor from public view.</p></div>
      <Button onClick={() => { setId(null); setForm(empty); setError(''); setOpen(true); }}>Add player sponsor</Button>
    </div>
    {!open && error && <p role="alert" className="mb-4 text-red-600">{error}</p>}
    {message && <p role="status" className="mb-4 text-content-primary">{message}</p>}
    {loading ? <p role="status">Loading player sponsors...</p> : rows.length === 0 ? <p>No player sponsors added yet.</p> : <ul className="divide-y divide-edge-subtle">
      {groupPlayerSponsors(rows).map((player) => <li key={player.key} className="py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold break-words">{player.player_name}</h2><p className="text-sm text-content-muted">{player.sponsors.length} {player.sponsors.length === 1 ? 'sponsor' : 'sponsors'}</p></div>
          <Button variant="secondary" aria-label={`Add another sponsor for ${player.player_name}`} onClick={() => { setId(null); setForm({ ...empty, player_name: player.player_name, player_image_url: player.player_image_url, sort_order: player.sponsors[0].sort_order }); setError(''); setOpen(true); }}>Add another sponsor</Button>
        </div>
        <ul className="mt-3 space-y-3" aria-label={`Sponsors of ${player.player_name}`}>
          {player.sponsors.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-edge-subtle p-3">
            <p className="text-content-muted break-words">{row.sponsor_name} - {row.active ? 'Visible' : 'Hidden'} - Order {row.sort_order}</p>
            <Button variant="secondary" aria-label={`Edit ${row.sponsor_name} for ${row.player_name}`} onClick={() => { setId(row.id); setForm({ player_name: row.player_name, sponsor_name: row.sponsor_name, player_image_url: row.player_image_url, logo_url: row.logo_url, website: row.website, sort_order: row.sort_order, active: row.active }); setError(''); setOpen(true); }}>Edit</Button>
          </li>)}
        </ul>
      </li>)}
    </ul>}
    <Modal isOpen={open} onClose={() => { if (!busy && !uploading) setOpen(false); }} title={id ? 'Edit player sponsor' : 'Add player sponsor'} size="lg">
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        {error && <p role="alert" className="text-red-600">{error}</p>}
        <Input id="player-name" list="existing-player-names" label="Player name" required maxLength={160} value={form.player_name} onChange={(event) => setForm({ ...form, player_name: event.target.value })} />
        <datalist id="existing-player-names">{groupPlayerSponsors(rows).map((player) => <option key={player.key} value={player.player_name} />)}</datalist>
        <ImageUploadField id="player-photo" onUploadingChange={setPhotoUploading} label="Player photo (optional)" value={form.player_image_url} onChange={(value) => setForm((current) => ({ ...current, player_image_url: value }))} />
        <Input id="player-sponsor-name" label="Sponsor name" required maxLength={160} value={form.sponsor_name} onChange={(event) => setForm({ ...form, sponsor_name: event.target.value })} />
        <ImageUploadField id="player-sponsor-logo" onUploadingChange={setLogoUploading} label="Sponsor logo" value={form.logo_url} onChange={(value) => setForm((current) => ({ ...current, logo_url: value }))} helpText="Upload the sponsor's approved logo. Without a logo, the sponsor name is displayed." />
        <Input id="player-sponsor-website" label="Sponsor website (optional)" placeholder="example.com or https://example.com" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} />
        <Input id="player-sponsor-order" label="Display order (lower appears first)" type="number" min={-100000} max={100000} step={1} value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: Number(event.target.value) })} />
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />Show on Player Sponsors page</label>
        <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={busy || uploading} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={uploading} isLoading={busy}>{uploading ? 'Waiting for upload...' : 'Save player sponsor'}</Button></div>
      </form>
    </Modal>
  </div>;
}
