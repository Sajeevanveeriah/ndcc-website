'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { adminFetch } from '@/lib/admin-client';
import {
  WHEEL_DAILY_PRIZE_CAP_CENTS,
  WHEEL_MAX_PRIZE_POOL_CENTS,
  WHEEL_RECORD_RETENTION_YEARS,
  formatAud,
  formatMelbourneDateTime,
  prizeTotalCents,
  sameDayPrizeTotalCents,
  ticketValueSummary,
  validateWheelCampaign,
  type WheelCampaignInput,
} from '@/lib/prize-wheel/rules';

type Prize = { id?: string; position?: number; name: string; description: string | null; retail_value_cents: number; quantity: number };
type Campaign = {
  id: string; name: string; code: string; price_cents: number; draw_at: string; draw_label: string; sales_open_at: string;
  wheel_divisions: number; prize_pool_cents: number; active: boolean; public_visibility_mode: 'hidden' | 'scheduled' | 'visible';
  public_opens_at: string | null; raffle_wheel_prizes?: Prize[];
};
type PrizeDraft = { name: string; description: string; value: string; quantity: string };
type Draft = {
  id: string | null; name: string; price: string; divisions: string; salesOpen: string; drawAt: string; drawLabel: string;
  active: boolean; visibility: 'hidden' | 'scheduled' | 'visible'; opensAt: string; prizes: PrizeDraft[]; noCash: boolean;
};

const toLocal = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (value: string) => (value ? new Date(value).toISOString() : '');
const dollarsToCents = (value: string) => (/^\d+(\.\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value) * 100) : NaN);
const emptyDraft = (): Draft => ({ id: null, name: 'Dinos Prize Wheel', price: '', divisions: '', salesOpen: '', drawAt: '', drawLabel: '', active: false, visibility: 'hidden', opensAt: '', prizes: [{ name: '', description: '', value: '', quantity: '1' }], noCash: false });

function draftFrom(campaign: Campaign): Draft {
  return {
    id: campaign.id, name: campaign.name, price: (campaign.price_cents / 100).toFixed(2), divisions: String(campaign.wheel_divisions),
    salesOpen: toLocal(campaign.sales_open_at), drawAt: toLocal(campaign.draw_at), drawLabel: campaign.draw_label, active: campaign.active,
    visibility: campaign.public_visibility_mode, opensAt: toLocal(campaign.public_opens_at), noCash: false,
    prizes: [...(campaign.raffle_wheel_prizes || [])].sort((a, b) => (a.position || 0) - (b.position || 0)).map(prize => ({
      name: prize.name, description: prize.description || '', value: (prize.retail_value_cents / 100).toFixed(2), quantity: String(prize.quantity),
    })),
  };
}

function inputFrom(draft: Draft): WheelCampaignInput {
  return {
    name: draft.name.trim(), price_cents: dollarsToCents(draft.price), wheel_divisions: Number(draft.divisions),
    sales_open_at: fromLocal(draft.salesOpen), draw_at: fromLocal(draft.drawAt), draw_label: draft.drawLabel.trim(),
    active: draft.active, public_visibility_mode: draft.visibility, public_opens_at: draft.visibility === 'scheduled' ? fromLocal(draft.opensAt) || null : null,
    prizes: draft.prizes.map(prize => ({ name: prize.name.trim(), description: prize.description.trim() || null, retail_value_cents: dollarsToCents(prize.value), quantity: Number(prize.quantity) })),
  };
}

export default function WheelCampaignManager() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [available, setAvailable] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/raffle/wheel');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Prize wheel campaigns could not be loaded.');
      setCampaigns(data.campaigns || []); setAvailable(data.available !== false); setCanEdit(data.canEdit === true);
    } catch (error) { setErrors([error instanceof Error ? error.message : 'Prize wheel campaigns could not be loaded.']); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const input = draft ? inputFrom(draft) : null;
  const liveErrors = input ? validateWheelCampaign(input, campaigns, draft?.id) : [];
  const pool = input ? prizeTotalCents(input.prizes) : 0;
  const summary = input ? ticketValueSummary(input.price_cents, input.wheel_divisions, pool) : null;
  const sameDay = input && input.draw_at ? sameDayPrizeTotalCents(campaigns, input.draw_at, draft?.id) : 0;

  async function save() {
    if (!draft || !input) return;
    if (!draft.noCash) { setErrors(['Confirm that no prize is cash, a debit card or a cash equivalent.']); return; }
    if (liveErrors.length) { setErrors(liveErrors); return; }
    setSaving(true); setErrors([]); setMessage('');
    try {
      const response = await adminFetch('/api/admin/raffle/wheel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, id: draft.id, no_cash_prizes_confirmed: true }) });
      const data = await response.json();
      if (!response.ok) { setErrors(Array.isArray(data.errors) ? data.errors : [data.error || 'The prize wheel could not be saved.']); return; }
      setMessage('Prize wheel saved.'); setDraft(null); await load();
    } catch (error) { setErrors([error instanceof Error ? error.message : 'The prize wheel could not be saved.']); }
    finally { setSaving(false); }
  }

  const setPrize = (index: number, patch: Partial<PrizeDraft>) => draft && setDraft({ ...draft, prizes: draft.prizes.map((prize, i) => i === index ? { ...prize, ...patch } : prize) });

  return <section className="rounded-lg border border-edge-subtle bg-surface-card p-5 space-y-4" aria-labelledby="prize-wheel-title">
    <div>
      <h2 id="prize-wheel-title" className="font-display text-xl font-bold">Prize wheel (small raffle)</h2>
      <p className="text-sm text-content-muted">Numbered tickets sold for a live spinning-wheel draw at the clubrooms. Nothing is spun online. Small raffle limits: prizes up to {formatAud(WHEEL_MAX_PRIZE_POOL_CENTS)} (and {formatAud(WHEEL_DAILY_PRIZE_CAP_CENTS)} across all wheels drawn that day), sales open no more than 8 hours before the draw, total ticket value between 2 and 6 times the prizes, no cash prizes, 18+ only. Keep all sales and draw records for {WHEEL_RECORD_RETENTION_YEARS} years (download the report after each draw).</p>
    </div>
    {!available && <p role="status">The prize wheel database update has not been applied yet.</p>}
    {message && <p role="status" className="text-green-700 dark:text-green-400">{message}</p>}
    {errors.length > 0 && <ul role="alert" className="list-disc pl-5 text-red-700 dark:text-red-400">{errors.map(error => <li key={error}>{error}</li>)}</ul>}
    {campaigns.length > 0 && <ul className="divide-y divide-edge-subtle">
      {campaigns.map(campaign => <li key={campaign.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-semibold">{campaign.name} <span className="text-sm text-content-muted">({campaign.code})</span></p>
          <p className="text-sm text-content-muted">Draw {formatMelbourneDateTime(campaign.draw_at)} at {campaign.draw_label}. {campaign.wheel_divisions} numbers at {formatAud(campaign.price_cents)}. Prizes {formatAud(campaign.prize_pool_cents)}. {campaign.active ? 'Active' : 'Inactive'}, {campaign.public_visibility_mode}.</p></div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-secondary" href={`/admin/raffle/wheel/${campaign.id}`}>Sales and winners</Link>
          <Link className="btn-secondary" href={`/admin/raffle/wheel/${campaign.id}/draw`}>Live draw screen</Link>
          {canEdit && <Button variant="ghost" onClick={() => { setDraft(draftFrom(campaign)); setErrors([]); setMessage(''); }}>Edit</Button>}
        </div>
      </li>)}
    </ul>}
    {available && canEdit && !draft && <Button onClick={() => { setDraft(emptyDraft()); setErrors([]); setMessage(''); }}>New prize wheel</Button>}
    {draft && <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(); }}>
      <h3 className="font-bold">{draft.id ? 'Edit prize wheel' : 'New prize wheel'}</h3>
      <p className="text-sm text-content-muted">Price, numbers, times and prizes lock once the first ticket is sold.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input id="wheel-campaign-name" label="Campaign name" value={draft.name} maxLength={120} onChange={e => setDraft({ ...draft, name: e.target.value })} />
        <Input id="wheel-campaign-place" label="Draw place (shown publicly)" value={draft.drawLabel} maxLength={200} onChange={e => setDraft({ ...draft, drawLabel: e.target.value })} />
        <Input id="wheel-campaign-price" label="Ticket price (AUD)" inputMode="decimal" value={draft.price} onChange={e => setDraft({ ...draft, price: e.target.value })} />
        <Input id="wheel-campaign-divisions" label="Wheel numbers (divisions, 2 to 100)" type="number" min={2} max={100} value={draft.divisions} onChange={e => setDraft({ ...draft, divisions: e.target.value })} />
        <Input id="wheel-campaign-open" label="Sales open - Melbourne time" type="datetime-local" value={draft.salesOpen} onChange={e => setDraft({ ...draft, salesOpen: e.target.value })} />
        <Input id="wheel-campaign-draw" label="Live draw - Melbourne time" type="datetime-local" value={draft.drawAt} onChange={e => setDraft({ ...draft, drawAt: e.target.value })} />
        <label className="block"><span className="form-label">Public visibility</span>
          <select className="min-h-11 w-full rounded-md border border-edge-subtle bg-surface-card px-3" value={draft.visibility} onChange={e => setDraft({ ...draft, visibility: e.target.value as Draft['visibility'] })}>
            <option value="hidden">Hidden</option><option value="scheduled">Scheduled</option><option value="visible">Visible now</option>
          </select></label>
        {draft.visibility === 'scheduled' && <Input id="wheel-campaign-opens" label="Public page opens - Melbourne time" type="datetime-local" value={draft.opensAt} onChange={e => setDraft({ ...draft, opensAt: e.target.value })} />}
        <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} /> Active</label>
      </div>
      <fieldset className="space-y-3">
        <legend className="font-bold">Prizes (drawn in this order; one winner per prize)</legend>
        {draft.prizes.map((prize, index) => <div key={index} className="grid gap-3 rounded-md border border-edge-subtle p-3 sm:grid-cols-[2fr_2fr_1fr_1fr_auto] items-end">
          <Input id={`wheel-prize-name-${index}`} label={`Prize ${index + 1}`} value={prize.name} maxLength={120} onChange={e => setPrize(index, { name: e.target.value })} />
          <Input id={`wheel-prize-description-${index}`} label="Description (optional)" value={prize.description} maxLength={500} onChange={e => setPrize(index, { description: e.target.value })} />
          <Input id={`wheel-prize-value-${index}`} label="Retail value each (AUD)" inputMode="decimal" value={prize.value} onChange={e => setPrize(index, { value: e.target.value })} />
          <Input id={`wheel-prize-quantity-${index}`} label="Quantity" type="number" min={1} max={100} value={prize.quantity} onChange={e => setPrize(index, { quantity: e.target.value })} />
          <Button type="button" variant="ghost" disabled={draft.prizes.length <= 1} onClick={() => setDraft({ ...draft, prizes: draft.prizes.filter((_, i) => i !== index) })}>Remove</Button>
        </div>)}
        <Button type="button" variant="secondary" onClick={() => setDraft({ ...draft, prizes: [...draft.prizes, { name: '', description: '', value: '', quantity: '1' }] })}>Add prize</Button>
      </fieldset>
      <div className="rounded-md border border-edge-subtle p-3 text-sm space-y-1" aria-live="polite">
        <p className="font-bold">Small raffle check</p>
        <p>Total prizes: {Number.isSafeInteger(pool) ? formatAud(pool) : '-'} (maximum {formatAud(WHEEL_MAX_PRIZE_POOL_CENTS)})</p>
        <p>Total ticket value: {summary && Number.isSafeInteger(summary.totalTicketCents) ? formatAud(summary.totalTicketCents) : '-'}; allowed range {summary && pool > 0 ? `${formatAud(summary.minCents)} to ${formatAud(summary.maxCents)}` : '-'} (2x to 6x prizes). {summary?.withinRange ? 'Within range.' : 'Outside range.'}</p>
        <p>Other active wheels drawn the same day: {formatAud(sameDay)} (limit {formatAud(WHEEL_DAILY_PRIZE_CAP_CENTS)} in total)</p>
        {liveErrors.length === 0 ? <p className="font-semibold">All small raffle limits are met.</p> : <ul className="list-disc pl-5">{liveErrors.map(error => <li key={error}>{error}</li>)}</ul>}
      </div>
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 h-5 w-5" checked={draft.noCash} onChange={e => setDraft({ ...draft, noCash: e.target.checked })} /> <span>No prize is cash, a debit card or a cash equivalent.</span></label>
      <div className="flex gap-2"><Button type="submit" isLoading={saving}>Save prize wheel</Button><Button type="button" variant="ghost" onClick={() => { setDraft(null); setErrors([]); }}>Cancel</Button></div>
    </form>}
  </section>;
}
