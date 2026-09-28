'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import SpinWheelGraphic from '@/components/spin-wheel/SpinWheelGraphic';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import { datetimeLocalToClubIso, toDatetimeLocalInClubTimezone } from '@/lib/utils';
import { rotationForNumber } from '@/lib/prize-wheel/wheel-geometry';
import {
  SPIN_ANIMATION_MS,
  SPIN_COLOURS,
  SPIN_COLOUR_HEX,
  SPIN_LABEL_MAX,
  SPIN_MAX_SEGMENTS,
  formatMelbourneDateTime,
  formatPercent,
  normaliseSpinWheelInput,
  segmentProbabilities,
  spinWheelWarnings,
  validateSpinWheel,
  type SpinColour,
  type SpinSegmentRow,
  type SpinWheelInput,
  type SpinWheelRow,
  type SpinWheelStatus,
  type SpinVisibilityMode,
} from '@/lib/spin-wheel/rules';

type Stats = { spins: number; prizes: number; unclaimed: number; paidOrders: number; openSpins: number };
type SegmentDraft = { key: string; id: string | null; label: string; prize_name: string; prize_description: string; is_prize: boolean; weight: string; stock: string; colour: SpinColour };
type Draft = {
  name: string; description: string; status: SpinWheelStatus; starts: string; ends: string; freeSpins: string; price: string;
  maxPerOrder: string; claim: string; visibility: SpinVisibilityMode; opensAt: string; segments: SegmentDraft[];
};
type Result = {
  id: string; reference: string; segment_position: number; segment_label: string; prize_name: string | null; is_prize: boolean;
  spinner_email: string | null; spinner_name: string | null; auth_user_id: string | null; created_at: string;
  claimed_at: string | null; voided_at: string | null; void_reason: string | null; winner_emailed_at: string | null;
};

// The inputs are labelled Melbourne time, whatever the browser's own zone is.
const toLocal = (value: string | null) => (value ? toDatetimeLocalInClubTimezone(value) : '');
const fromLocal = (value: string) => (value ? datetimeLocalToClubIso(value) : null);
const dollarsToCents = (value: string) => (/^\d+(\.\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value) * 100) : NaN);
let keyCounter = 0;
const nextKey = () => `segment-${keyCounter += 1}`;
const blankSegment = (colour: SpinColour, label = ''): SegmentDraft => ({ key: nextKey(), id: null, label, prize_name: '', prize_description: '', is_prize: false, weight: '1', stock: '', colour });

const emptyDraft = (): Draft => ({
  name: '', description: '', status: 'draft', starts: '', ends: '', freeSpins: '1', price: '', maxPerOrder: '20', claim: '',
  visibility: 'hidden', opensAt: '',
  segments: [blankSegment('maroon'), blankSegment('blue'), blankSegment('gold'), blankSegment('navy')],
});

function draftFrom(wheel: SpinWheelRow, segments: SpinSegmentRow[]): Draft {
  return {
    name: wheel.name, description: wheel.description || '', status: wheel.status, starts: toLocal(wheel.starts_at), ends: toLocal(wheel.ends_at),
    freeSpins: String(wheel.free_spins_per_account), price: wheel.spin_price_cents === null ? '' : (wheel.spin_price_cents / 100).toFixed(2),
    maxPerOrder: String(wheel.max_spins_per_order), claim: wheel.claim_instructions || '', visibility: wheel.public_visibility_mode,
    opensAt: toLocal(wheel.public_opens_at),
    segments: [...segments].sort((a, b) => a.position - b.position).map(segment => ({
      key: nextKey(), id: segment.id, label: segment.label, prize_name: segment.prize_name || '', prize_description: segment.prize_description || '',
      is_prize: segment.is_prize, weight: String(segment.weight), stock: segment.stock === null ? '' : String(segment.stock), colour: segment.colour,
    })),
  };
}

function inputFrom(draft: Draft, id: string | null): SpinWheelInput | null {
  return normaliseSpinWheelInput({
    id, name: draft.name, description: draft.description, status: draft.status, starts_at: fromLocal(draft.starts), ends_at: fromLocal(draft.ends),
    free_spins_per_account: draft.freeSpins.trim() === '' ? 0 : Number(draft.freeSpins),
    spin_price_cents: draft.price.trim() === '' ? null : dollarsToCents(draft.price),
    max_spins_per_order: Number(draft.maxPerOrder), claim_instructions: draft.claim, public_visibility_mode: draft.visibility,
    public_opens_at: fromLocal(draft.opensAt),
    segments: draft.segments.map(segment => ({
      id: segment.id, label: segment.label, prize_name: segment.prize_name, prize_description: segment.prize_description,
      is_prize: segment.is_prize, weight: segment.weight.trim() === '' ? NaN : Number(segment.weight),
      stock: segment.stock.trim() === '' ? null : Number(segment.stock), colour: segment.colour,
    })),
  });
}

export default function SpinWheelEditorPage() {
  const rawId = String(useParams<{ id: string }>().id || '');
  const isNew = rawId === 'new';
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(isNew ? emptyDraft() : null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (isNew) return;
    try {
      const data = await parseApiResponse<{ wheel: SpinWheelRow; segments: SpinSegmentRow[]; stats: Stats }>(await adminFetch(`/api/admin/spin-wheel/${encodeURIComponent(rawId)}`));
      setDraft(draftFrom(data.wheel, data.segments));
      setStats(data.stats);
      setLoadError('');
    } catch (failure) {
      setLoadError(failure instanceof Error ? failure.message : 'The wheel could not be loaded.');
    }
  }, [isNew, rawId]);
  useEffect(() => { void load(); }, [load]);

  const input = useMemo(() => (draft ? inputFrom(draft, isNew ? null : rawId) : null), [draft, isNew, rawId]);
  const probabilities = useMemo(() => (input ? segmentProbabilities(input.segments.map(segment => ({ weight: Number.isFinite(segment.weight) ? segment.weight : 0, stock: segment.stock }))) : []), [input]);
  const warnings = input ? spinWheelWarnings(input) : [];

  if (loadError && !draft) return <p role="alert">{loadError}</p>;
  if (!draft || !input) return <p role="status">Loading wheel...</p>;

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setSegment = (index: number, patch: Partial<SegmentDraft>) => set({ segments: draft.segments.map((segment, i) => (i === index ? { ...segment, ...patch } : segment)) });
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.segments.length) return;
    const segments = [...draft.segments];
    [segments[index], segments[target]] = [segments[target], segments[index]];
    set({ segments });
  };
  const totalWeight = input.segments.reduce((sum, segment) => sum + (Number.isFinite(segment.weight) && segment.weight > 0 ? segment.weight : 0), 0);

  async function save(confirmClose = false) {
    if (!input || busy) return;
    const problems = validateSpinWheel(input);
    setErrors(problems); setMessage('');
    if (problems.length) return;
    setBusy(true);
    try {
      const response = await adminFetch('/api/admin/spin-wheel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, confirm_close: confirmClose }) });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409 && data.needsConfirmation && !confirmClose) {
        setBusy(false);
        if (window.confirm(`${data.error} Save anyway?`)) await save(true);
        return;
      }
      if (!response.ok) { setErrors(Array.isArray(data.errors) ? data.errors : [data.error || 'The wheel could not be saved.']); return; }
      setMessage('Wheel saved.');
      if (isNew) router.replace(`/admin/raffle/spin-wheel/${data.id}`);
      else await load();
    } catch {
      setErrors(['The wheel could not be saved.']);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (isNew || !window.confirm('Delete this wheel? This only works for a wheel that has never been spun or sold.')) return;
    setBusy(true); setErrors([]);
    try {
      await parseApiResponse(await adminFetch(`/api/admin/spin-wheel/${encodeURIComponent(rawId)}`, { method: 'DELETE' }));
      router.replace('/admin/raffle/spin-wheel');
    } catch (failure) {
      setErrors([failure instanceof Error ? failure.message : 'The wheel could not be deleted.']);
      setBusy(false);
    }
  }

  return <div className="space-y-8">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Link href="/admin/raffle/spin-wheel" className="text-sm underline">All wheels</Link>
        <h1 className="text-2xl font-display font-bold">{isNew ? 'New wheel' : draft.name || 'Wheel'}</h1>
        {stats && <p className="text-content-muted">{stats.spins} spins, {stats.prizes} prizes won ({stats.unclaimed} unclaimed), {stats.paidOrders} paid orders, {stats.openSpins} spins not yet used.</p>}
      </div>
      {!isNew && draft.status !== 'draft' && <Link href="/spin-the-wheel" target="_blank" className="underline">Open public page</Link>}
    </div>

    <section aria-labelledby="spin-settings" className="rounded-xl border border-edge-subtle p-5 space-y-4">
      <h2 id="spin-settings" className="text-xl font-bold">Settings</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Input id="spin-name" label="Wheel name" maxLength={120} value={draft.name} onChange={e => set({ name: e.target.value })} />
        <label className="block"><span className="form-label">Status</span>
          <select className="form-input" value={draft.status} onChange={e => set({ status: e.target.value as SpinWheelStatus })}>
            <option value="draft">Draft (not public)</option><option value="live">Live (people can spin)</option>
            <option value="paused">Paused (page shows, no spins)</option><option value="ended">Ended</option>
          </select></label>
        <Input id="spin-starts" label="Opens - Melbourne time (optional)" type="datetime-local" value={draft.starts} onChange={e => set({ starts: e.target.value })} />
        <Input id="spin-ends" label="Closes - Melbourne time (optional)" type="datetime-local" value={draft.ends} onChange={e => set({ ends: e.target.value })} />
        <Input id="spin-free" label="Free spins per club account" type="number" min={0} max={100} value={draft.freeSpins} onChange={e => set({ freeSpins: e.target.value })} />
        <Input id="spin-price" label="Price per extra spin in AUD (blank = no paid spins)" inputMode="decimal" value={draft.price} onChange={e => set({ price: e.target.value })} />
        <Input id="spin-max" label="Most spins in one order" type="number" min={1} max={100} value={draft.maxPerOrder} onChange={e => set({ maxPerOrder: e.target.value })} />
        <label className="block"><span className="form-label">Public page</span>
          <select className="form-input" value={draft.visibility} onChange={e => set({ visibility: e.target.value as SpinVisibilityMode })}>
            <option value="hidden">Hidden</option><option value="scheduled">Scheduled</option><option value="visible">Visible</option>
          </select></label>
        {draft.visibility === 'scheduled' && <Input id="spin-opens" label="Public page opens - Melbourne time" type="datetime-local" value={draft.opensAt} onChange={e => set({ opensAt: e.target.value })} />}
      </div>
      <label className="block"><span className="form-label">Description shown on the public page</span>
        <textarea className="form-input min-h-24" maxLength={2000} value={draft.description} onChange={e => set({ description: e.target.value })} /></label>
      <label className="block"><span className="form-label">How winners claim their prize (shown on the page and in the winner email)</span>
        <textarea className="form-input min-h-24" maxLength={2000} value={draft.claim} onChange={e => set({ claim: e.target.value })} /></label>
    </section>

    <section aria-labelledby="spin-segments" className="rounded-xl border border-edge-subtle p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="spin-segments" className="text-xl font-bold">Segments</h2>
        <p className="text-sm text-content-muted">Total odds weight: {totalWeight.toLocaleString('en-AU')}. Probability = weight / total weight of in-stock segments.</p>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <caption className="sr-only">Wheel segments in order, clockwise from the pointer</caption>
        <thead><tr>{['#', 'Label on wheel', 'Prize', 'Odds weight', 'Stock left', 'Chance', 'Colour', ''].map(label => <th key={label || 'actions'} scope="col" className="p-2">{label}</th>)}</tr></thead>
        <tbody>{draft.segments.map((segment, index) => <tr key={segment.key} className="border-t border-edge-subtle align-top">
          <td className="p-2 font-semibold">{index + 1}</td>
          <td className="p-2"><input aria-label={`Segment ${index + 1} label`} className="form-input" maxLength={SPIN_LABEL_MAX} value={segment.label} onChange={e => setSegment(index, { label: e.target.value })} /></td>
          <td className="p-2 space-y-2 min-w-56">
            <label className="flex items-center gap-2"><input type="checkbox" checked={segment.is_prize} onChange={e => setSegment(index, { is_prize: e.target.checked })} /> Wins a prize</label>
            {segment.is_prize && <>
              <input aria-label={`Segment ${index + 1} prize name`} placeholder="Prize name" className="form-input" maxLength={120} value={segment.prize_name} onChange={e => setSegment(index, { prize_name: e.target.value })} />
              <input aria-label={`Segment ${index + 1} prize description`} placeholder="Prize description (optional)" className="form-input" maxLength={500} value={segment.prize_description} onChange={e => setSegment(index, { prize_description: e.target.value })} />
            </>}
          </td>
          <td className="p-2"><input aria-label={`Segment ${index + 1} odds weight`} className="form-input w-28" type="number" min={0} step={1} value={segment.weight} onChange={e => setSegment(index, { weight: e.target.value })} /></td>
          <td className="p-2"><input aria-label={`Segment ${index + 1} stock left, blank for unlimited`} placeholder="Unlimited" className="form-input w-28" type="number" min={0} step={1} value={segment.stock} onChange={e => setSegment(index, { stock: e.target.value })} /></td>
          <td className="p-2 whitespace-nowrap">{formatPercent(probabilities[index] || 0)}</td>
          <td className="p-2"><select aria-label={`Segment ${index + 1} colour`} className="form-input" value={segment.colour} onChange={e => setSegment(index, { colour: e.target.value as SpinColour })}>
            {SPIN_COLOURS.map(colour => <option key={colour} value={colour}>{SPIN_COLOUR_HEX[colour].label}</option>)}
          </select></td>
          <td className="p-2 whitespace-nowrap space-x-1">
            <button type="button" className="underline" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move segment ${index + 1} up`}>Up</button>
            <button type="button" className="underline" onClick={() => move(index, 1)} disabled={index === draft.segments.length - 1} aria-label={`Move segment ${index + 1} down`}>Down</button>
            <button type="button" className="underline text-red-700" onClick={() => set({ segments: draft.segments.filter((_, i) => i !== index) })} aria-label={`Remove segment ${index + 1}`}>Remove</button>
          </td>
        </tr>)}</tbody>
      </table></div>
      <Button type="button" variant="secondary" disabled={draft.segments.length >= SPIN_MAX_SEGMENTS}
        onClick={() => set({ segments: [...draft.segments, blankSegment(SPIN_COLOURS[draft.segments.length % 4])] })}>Add segment</Button>
      <p className="text-sm text-content-muted">Removing a segment keeps past results (they store what was won). Stock goes down by one each time the segment comes up; blank means unlimited.</p>
    </section>

    {warnings.length > 0 && <ul className="rounded-lg border border-amber-500 p-4 text-sm" role="status">{warnings.map(item => <li key={item}>{item}</li>)}</ul>}
    {errors.length > 0 && <ul className="rounded-lg border border-red-500 p-4 text-sm text-red-700" role="alert">{errors.map(item => <li key={item}>{item}</li>)}</ul>}
    {message && <p role="status" className="font-semibold">{message}</p>}
    <div className="flex flex-wrap gap-3">
      <Button type="button" onClick={() => void save()} isLoading={busy}>{isNew ? 'Create wheel' : 'Save wheel'}</Button>
      <PreviewSpin segments={input.segments.map((segment, index) => ({ position: index + 1, label: segment.label || String(index + 1), colour: segment.colour }))} probabilities={probabilities} />
      {!isNew && <Button type="button" variant="danger" onClick={() => void remove()} disabled={busy}>Delete wheel</Button>}
    </div>

    {!isNew && <GrantSpins wheelId={rawId} onGranted={() => void load()} />}
    {!isNew && <Results wheelId={rawId} />}
  </div>;
}

/** Test spin in the editor: picks locally by the current odds and records nothing. */
function PreviewSpin({ segments, probabilities }: { segments: Array<{ position: number; label: string; colour: SpinColour }>; probabilities: number[] }) {
  const [open, setOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [landed, setLanded] = useState('');
  const [spinning, setSpinning] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  function spin() {
    if (spinning || segments.length < 2) return;
    let roll = Math.random();
    let index = probabilities.findIndex(probability => (roll -= probability) < 0);
    if (index < 0) index = Math.max(0, probabilities.findIndex(probability => probability > 0));
    setSpinning(true); setLanded('');
    setRotation(current => rotationForNumber(index + 1, segments.length, current, 6));
    window.setTimeout(() => { setLanded(segments[index]?.label || ''); setSpinning(false); }, SPIN_ANIMATION_MS);
  }
  return <>
    <Button type="button" variant="secondary" onClick={() => setOpen(true)}>Preview and test spin</Button>
    <dialog ref={dialog} onClose={() => setOpen(false)} className="w-[min(92vw,40rem)] rounded-xl p-6 backdrop:bg-black/50" aria-labelledby="spin-preview-title">
      <h2 id="spin-preview-title" className="text-xl font-bold">Preview (nothing is recorded)</h2>
      <div className="mx-auto my-4 max-w-md"><SpinWheelGraphic segments={segments} rotation={rotation} reducedMotion={false} label="Wheel preview" /></div>
      <p aria-live="polite" className="min-h-6 font-semibold">{landed ? `Landed on: ${landed}` : spinning ? 'Spinning...' : ''}</p>
      <div className="mt-4 flex gap-3"><Button type="button" onClick={spin} disabled={spinning}>Test spin</Button><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Close</Button></div>
    </dialog>
  </>;
}

function GrantSpins({ wheelId, onGranted }: { wheelId: string; onGranted: () => void }) {
  const [form, setForm] = useState({ email: '', name: '', spins: '1' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(''); setError('');
    try {
      const data = await parseApiResponse<{ emailed: boolean; link: string }>(await adminFetch(`/api/admin/spin-wheel/${encodeURIComponent(wheelId)}/grant`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, spins: Number(form.spins) }),
      }));
      setMessage(data.emailed ? `Spins granted and the link was emailed to ${form.email}.` : `Spins granted, but the email could not be sent. Send them this link: ${data.link}`);
      setForm({ email: '', name: '', spins: '1' });
      onGranted();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The spins could not be granted.');
    } finally {
      setBusy(false);
    }
  }
  return <form onSubmit={submit} className="rounded-xl border border-edge-subtle p-5 space-y-3" aria-labelledby="spin-grant">
    <h2 id="spin-grant" className="text-xl font-bold">Grant spins</h2>
    <p className="text-sm text-content-muted">Creates a spin link for the email address and emails it to them.</p>
    <div className="grid gap-3 md:grid-cols-3">
      <Input id="spin-grant-email" label="Email" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
      <Input id="spin-grant-name" label="Name (optional)" maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <Input id="spin-grant-spins" label="Spins" type="number" min={1} max={100} required value={form.spins} onChange={e => setForm({ ...form, spins: e.target.value })} />
    </div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {message && <p role="status" className="break-all">{message}</p>}
    <Button type="submit" variant="secondary" isLoading={busy}>Grant spins</Button>
  </form>;
}

function Results({ wheelId }: { wheelId: string }) {
  const [filter, setFilter] = useState<'all' | 'winners' | 'unclaimed'>('winners');
  const [rows, setRows] = useState<Result[] | null>(null);
  const [pages, setPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const query = filter === 'winners' ? '?winners=1' : filter === 'unclaimed' ? '?unclaimed=1' : '';
  useEffect(() => { setPages(1); }, [query]);
  // Reloads every page shown so far, so claims and voids stay in place.
  const load = useCallback(async () => {
    try {
      const all: Result[] = [];
      let more = false;
      for (let page = 0; page < pages; page += 1) {
        const separator = query ? '&' : '?';
        const data = await parseApiResponse<{ results: Result[]; hasMore: boolean }>(await adminFetch(`/api/admin/spin-wheel/${encodeURIComponent(wheelId)}/results${query}${separator}page=${page}`));
        all.push(...data.results);
        more = data.hasMore;
        if (!more) break;
      }
      setRows(all); setHasMore(more); setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Results could not be loaded.');
    }
  }, [wheelId, query, pages]);
  useEffect(() => { void load(); }, [load]);

  async function act(resultId: string, action: 'claim' | 'unclaim' | 'void') {
    let reason = '';
    if (action === 'void') {
      reason = window.prompt('Reason for voiding this result')?.trim() || '';
      if (!reason) return;
    }
    setBusy(resultId); setError('');
    try {
      await parseApiResponse(await adminFetch(`/api/admin/spin-wheel/${encodeURIComponent(wheelId)}/results`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resultId, action, reason }),
      }));
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The result could not be updated.');
    } finally {
      setBusy('');
    }
  }

  async function exportCsv() {
    try {
      const response = await adminFetch(`/api/admin/spin-wheel/${encodeURIComponent(wheelId)}/results?format=csv${query ? `&${query.slice(1)}` : ''}`);
      if (!response.ok) throw new Error('Export failed.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = `spin-wheel-results-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('The export could not be downloaded.');
    }
  }

  return <section aria-labelledby="spin-results" className="rounded-xl border border-edge-subtle p-5 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="spin-results" className="text-xl font-bold">Results</h2>
      <div className="flex flex-wrap gap-2">
        {(['winners', 'unclaimed', 'all'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
          className={`rounded-full border px-3 py-1 text-sm ${filter === value ? 'border-maroon-700 bg-maroon-700 text-white' : 'border-edge-subtle'}`}>{value === 'winners' ? 'Prizes won' : value === 'unclaimed' ? 'Unclaimed prizes' : 'Every spin'}</button>)}
        <Button type="button" variant="secondary" size="sm" onClick={() => void exportCsv()}>Download CSV</Button>
      </div>
    </div>
    {error && <p role="alert">{error}</p>}
    {!rows && !error && <p role="status">Loading results...</p>}
    {rows && (rows.length === 0 ? <p>No results for this filter.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <caption className="sr-only">Spin results</caption>
      <thead><tr>{['Reference', 'Who', 'Result', 'Spun (Melbourne)', 'Status', ''].map(label => <th key={label || 'actions'} scope="col" className="p-2">{label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id} className={`border-t border-edge-subtle ${row.voided_at ? 'text-content-muted line-through' : ''}`}>
        <td className="p-2 font-mono">{row.reference}</td>
        <td className="p-2">{row.spinner_name || '-'}<br />{row.spinner_email || ''}<br /><span className="text-xs">{row.auth_user_id ? 'Club account' : 'Spin link'}</span></td>
        <td className="p-2">{row.is_prize ? <strong>{row.prize_name}</strong> : row.segment_label}<br /><span className="text-xs">Segment {row.segment_position}</span></td>
        <td className="p-2">{formatMelbourneDateTime(row.created_at)}</td>
        <td className="p-2">{row.voided_at ? `Voided: ${row.void_reason}` : row.is_prize ? (row.claimed_at ? `Claimed ${formatMelbourneDateTime(row.claimed_at)}` : 'Not claimed') : '-'}
          {row.is_prize && !row.voided_at && <><br /><span className="text-xs">{row.winner_emailed_at ? 'Winner emailed' : 'Winner email not sent'}</span></>}</td>
        <td className="p-2 whitespace-nowrap space-x-2">{!row.voided_at && <>
          {row.is_prize && (row.claimed_at
            ? <button type="button" className="underline" disabled={busy === row.id} onClick={() => void act(row.id, 'unclaim')}>Undo claim</button>
            : <button type="button" className="underline" disabled={busy === row.id} onClick={() => void act(row.id, 'claim')}>Mark claimed</button>)}
          <button type="button" className="underline text-red-700" disabled={busy === row.id} onClick={() => void act(row.id, 'void')}>Void</button>
        </>}</td>
      </tr>)}</tbody>
    </table></div>)}
    {rows && hasMore && <Button type="button" variant="secondary" size="sm" onClick={() => setPages(count => count + 1)}>Show more results</Button>}
  </section>;
}
