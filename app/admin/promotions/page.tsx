'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input, { Textarea } from '@/components/ui/Input';
import ImageUploadField from '@/components/admin/ImageUploadField';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import { toDatetimeLocalInClubTimezone } from '@/lib/utils';
import { isPromotionLive, type SitePromotionRow } from '@/lib/promotion-rules';

type Promotion = SitePromotionRow & { id: string; created_at?: string; updated_at?: string };

type FormState = {
  id: string | null;
  slug: string;
  kind: 'home_banner' | 'fundraiser';
  title: string;
  body: string;
  link_url: string;
  link_label: string;
  image_url: string;
  starts_at: string;
  ends_at: string;
  placement: string;
  active: boolean;
  sort_order: number;
  details: Array<{ key: string; value: string }>;
};

type PotClubPlan = { id: string; name: string; price: number; is_active: boolean; product_code: string };

// Friendly names for the extra labels the website reads for the two built-in promotions.
const KNOWN_DETAILS: Record<string, Array<{ key: string; label: string }>> = {
  'junior-vouchers': [
    { key: 'heroLinkLabel', label: 'Home banner link text' },
    { key: 'roundLabel', label: 'Round name' },
    { key: 'startLabel', label: 'Start date as shown' },
    { key: 'endLabel', label: 'End date and time as shown' },
    { key: 'applicationDetailsUrl', label: 'Voucher and reimbursement details link' },
  ],
  'cookie-dough': [
    { key: 'deadlineLabel', label: 'Deadline text shown on the fundraiser page' },
  ],
};

const DETAIL_KEY = /^[A-Za-z][A-Za-z0-9]{0,39}$/;

const emptyForm: FormState = {
  id: null, slug: '', kind: 'home_banner', title: '', body: '', link_url: '', link_label: '', image_url: '',
  starts_at: '', ends_at: '', placement: 'home', active: false, sort_order: 0, details: [],
};

function toForm(promotion: Promotion): FormState {
  const details = Object.entries(promotion.details || {}).filter(([, value]) => typeof value === 'string').map(([key, value]) => ({ key, value: value as string }));
  for (const known of KNOWN_DETAILS[promotion.slug] || []) {
    if (!details.some((detail) => detail.key === known.key)) details.push({ key: known.key, value: '' });
  }
  return {
    id: promotion.id,
    slug: promotion.slug,
    kind: promotion.kind === 'fundraiser' ? 'fundraiser' : 'home_banner',
    title: promotion.title || '',
    body: promotion.body || '',
    link_url: promotion.link_url || '',
    link_label: promotion.link_label || '',
    image_url: promotion.image_url || '',
    starts_at: promotion.starts_at ? toDatetimeLocalInClubTimezone(promotion.starts_at) : '',
    ends_at: promotion.ends_at ? toDatetimeLocalInClubTimezone(promotion.ends_at) : '',
    placement: promotion.placement || 'home',
    active: promotion.active,
    sort_order: promotion.sort_order ?? 0,
    details,
  };
}

function statusFor(promotion: Promotion, now: number) {
  if (!promotion.active) return <Badge variant="warning">Hidden</Badge>;
  if (isPromotionLive(promotion, now)) return <Badge variant="success">Live</Badge>;
  if (promotion.starts_at && Date.parse(promotion.starts_at) > now) return <Badge variant="info">Scheduled</Badge>;
  return <Badge variant="default">Ended</Badge>;
}

function formatWhen(value: string | null) {
  return value ? new Date(value).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'medium', timeStyle: 'short' }) : '';
}

export default function AdminPromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [potPlans, setPotPlans] = useState<PotClubPlan[] | null>(null);
  const [potCode, setPotCode] = useState('');
  const [potSavedCode, setPotSavedCode] = useState('');
  const [potConfigurable, setPotConfigurable] = useState(true);
  const [potSaving, setPotSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminFetch('/api/admin/promotions', { cache: 'no-store' });
      const result = await parseApiResponse<{ data?: Promotion[]; available?: boolean }>(response);
      setPromotions(result.data || []);
      setAvailable(result.available !== false);
      setNow(Date.now());
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Promotions could not be loaded.' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPotClub = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/promotions/pot-club', { cache: 'no-store' });
      if (!response.ok) { setPotPlans(null); return; }
      const result = await parseApiResponse<{ plans: PotClubPlan[]; product_code: string; configurable: boolean }>(response);
      setPotPlans(result.plans);
      setPotCode(result.product_code);
      setPotSavedCode(result.product_code);
      setPotConfigurable(result.configurable);
    } catch {
      setPotPlans(null);
    }
  }, []);

  useEffect(() => { void load(); void loadPotClub(); }, [load, loadPotClub]);

  async function save() {
    if (!form) return;
    setFeedback(null);
    if (!form.title.trim()) { setFeedback({ type: 'error', message: 'Title is required.' }); return; }
    const badKey = form.details.find((detail) => detail.value.trim() && !DETAIL_KEY.test(detail.key));
    if (badKey) { setFeedback({ type: 'error', message: 'Extra detail names must start with a letter and use letters and numbers only.' }); return; }
    setSaving(true);
    const payload = {
      ...(form.id ? { id: form.id } : { slug: form.slug.trim() }),
      kind: form.kind,
      title: form.title,
      body: form.body,
      link_url: form.link_url.trim() || null,
      link_label: form.link_label.trim() || null,
      image_url: form.image_url.trim() || null,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
      placement: form.placement.trim() || 'home',
      active: form.active,
      sort_order: Number(form.sort_order) || 0,
      details: Object.fromEntries(form.details.filter((detail) => detail.key && detail.value.trim()).map((detail) => [detail.key, detail.value])),
    };
    try {
      const response = await adminFetch('/api/admin/promotions', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await parseApiResponse(response);
      setFeedback({ type: 'success', message: form.id ? 'Promotion updated.' : 'Promotion created.' });
      setForm(null);
      await load();
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'The promotion could not be saved.' });
    } finally {
      setSaving(false);
    }
  }

  async function savePotClub() {
    setPotSaving(true);
    setFeedback(null);
    try {
      const response = await adminFetch('/api/admin/promotions/pot-club', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_code: potCode }),
      });
      const result = await parseApiResponse<{ product_code: string }>(response);
      setPotSavedCode(result.product_code);
      setFeedback({ type: 'success', message: 'Pot Club product updated.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'The Pot Club product could not be saved.' });
    } finally {
      setPotSaving(false);
    }
  }

  const knownFor = form ? KNOWN_DETAILS[form.slug] || [] : [];
  const labelFor = (key: string) => knownFor.find((known) => known.key === key)?.label;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">Promotions</h1>
          <p className="text-sm text-content-muted">Time-limited home page banners and fundraisers. A promotion shows only while it is switched on and inside its start and end times (Australia/Melbourne).</p>
        </div>
        {available && <Button onClick={() => { setForm({ ...emptyForm }); setFeedback(null); }}>New promotion</Button>}
      </div>
      {feedback && (
        <p role="status" className={`text-sm px-3 py-2 rounded border ${feedback.type === 'error' ? 'text-red-600 bg-red-50 border-red-200' : 'text-green-700 bg-green-50 border-green-200'}`}>{feedback.message}</p>
      )}
      {!available && (
        <p className="rounded border border-edge-blue bg-surface-blue-subtle px-3 py-2 text-sm text-content-primary">Promotions need the latest database update. The website keeps showing its built-in promotions until then.</p>
      )}

      {form && (
        <section className="space-y-3 rounded-xl border bg-surface-card p-4" aria-labelledby="promotion-editor-title">
          <h2 id="promotion-editor-title" className="font-semibold">{form.id ? `Edit ${form.title || form.slug}` : 'New promotion'}</h2>
          {!form.id && (
            <Input id="promotion-slug" label="Short name (lowercase letters, numbers and hyphens; cannot be changed later)" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase() })} required />
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm text-content-secondary">Type
              <select className="mt-1 w-full rounded-lg border border-edge-strong bg-surface-card px-3 py-2" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as FormState['kind'] })}>
                <option value="home_banner">Home page banner</option>
                <option value="fundraiser">Fundraiser</option>
              </select>
            </label>
            <Input id="promotion-placement" label="Placement" value={form.placement} onChange={(event) => setForm({ ...form, placement: event.target.value })} />
          </div>
          <Input id="promotion-title" label="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
          <Textarea id="promotion-body" label="Text" rows={3} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input id="promotion-link" label="Link (https:// or a site path)" value={form.link_url} onChange={(event) => setForm({ ...form, link_url: event.target.value })} />
            <Input id="promotion-link-label" label="Link text" value={form.link_label} onChange={(event) => setForm({ ...form, link_label: event.target.value })} />
          </div>
          <ImageUploadField id="promotion-image" label="Image (optional)" value={form.image_url} onChange={(value) => setForm((current) => current ? { ...current, image_url: value } : current)} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input id="promotion-starts" type="datetime-local" label="Starts - Australia/Melbourne (blank = straight away)" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} />
            <Input id="promotion-ends" type="datetime-local" label="Ends - Australia/Melbourne (blank = no end)" value={form.ends_at} onChange={(event) => setForm({ ...form, ends_at: event.target.value })} />
          </div>
          <Input id="promotion-order" type="number" label="Display order (lower appears first)" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: Number(event.target.value || 0) })} />
          <fieldset className="space-y-2 rounded-lg border border-edge-subtle p-3">
            <legend className="px-1 text-sm font-medium text-content-secondary">Extra labels</legend>
            {form.details.length === 0 && <p className="text-xs text-content-muted">No extra labels.</p>}
            {form.details.map((detail, index) => (
              <div key={index} className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,14rem)_1fr_auto] md:items-end">
                {labelFor(detail.key) ? (
                  <p className="text-sm text-content-secondary md:pb-2">{labelFor(detail.key)}</p>
                ) : (
                  <Input id={`promotion-detail-key-${index}`} label="Name" value={detail.key} onChange={(event) => setForm({ ...form, details: form.details.map((item, i) => i === index ? { ...item, key: event.target.value.trim() } : item) })} />
                )}
                <Input id={`promotion-detail-value-${index}`} label="Value" aria-label={labelFor(detail.key) || detail.key || 'Value'} value={detail.value} onChange={(event) => setForm({ ...form, details: form.details.map((item, i) => i === index ? { ...item, value: event.target.value } : item) })} />
                {!labelFor(detail.key) && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, details: form.details.filter((_, i) => i !== index) })}>Remove</Button>
                )}
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => setForm({ ...form, details: [...form.details, { key: '', value: '' }] })}>Add label</Button>
          </fieldset>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
            Switched on (shown during its dates)
          </label>
          <div className="flex justify-end gap-3 border-t border-edge-subtle pt-3">
            <Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
            <Button onClick={() => void save()} isLoading={saving}>{form.id ? 'Save promotion' : 'Create promotion'}</Button>
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-surface-card p-4">
        <h2 className="mb-3 font-semibold">All promotions</h2>
        {loading ? <p className="text-sm text-content-muted">Loading promotions...</p> : promotions.length === 0 ? (
          <p className="text-sm text-content-muted">No promotions yet.</p>
        ) : (
          <ul className="divide-y divide-edge-subtle">
            {promotions.map((promotion) => (
              <li key={promotion.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{promotion.title || promotion.slug} <span className="ml-1 align-middle">{statusFor(promotion, now)}</span></p>
                  <p className="text-xs text-content-muted">
                    {promotion.kind === 'fundraiser' ? 'Fundraiser' : 'Home page banner'}
                    {promotion.starts_at ? ` - from ${formatWhen(promotion.starts_at)}` : ''}
                    {promotion.ends_at ? ` - until ${formatWhen(promotion.ends_at)}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => { setForm(toForm(promotion)); setFeedback(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</Button>
                  {promotion.active && (
                    <Button variant="ghost" size="sm" onClick={async () => {
                      try {
                        const response = await adminFetch('/api/admin/promotions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: promotion.id, active: false }) });
                        await parseApiResponse(response);
                        setFeedback({ type: 'success', message: `${promotion.title || promotion.slug} switched off.` });
                        await load();
                      } catch (error) {
                        setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'The promotion could not be switched off.' });
                      }
                    }}>Switch off</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {potPlans && (
        <section className="space-y-3 rounded-xl border bg-surface-card p-4" aria-labelledby="pot-club-heading">
          <h2 id="pot-club-heading" className="font-semibold">Pot Club product</h2>
          <p className="text-sm text-content-muted">Choose which membership plan the Pot Club page sells. Its name and price come from that plan in Memberships.</p>
          {potPlans.length === 0 ? <p className="text-sm text-content-muted">No membership plans have a product code.</p> : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm text-content-secondary">Membership plan
                <select className="mt-1 block rounded-lg border border-edge-strong bg-surface-card px-3 py-2" value={potCode} onChange={(event) => setPotCode(event.target.value)} disabled={!potConfigurable}>
                  {!potPlans.some((plan) => plan.product_code === potCode) && <option value={potCode}>{potCode} (no matching plan)</option>}
                  {potPlans.map((plan) => (
                    <option key={plan.id} value={plan.product_code}>{plan.name} - AUD {plan.price}{plan.is_active ? '' : ' (inactive)'}</option>
                  ))}
                </select>
              </label>
              <Button onClick={() => void savePotClub()} isLoading={potSaving} disabled={!potConfigurable || potCode === potSavedCode}>Save Pot Club product</Button>
            </div>
          )}
          {!potConfigurable && <p className="text-xs text-content-muted">Changing the Pot Club product needs the latest database update.</p>}
        </section>
      )}
    </div>
  );
}
