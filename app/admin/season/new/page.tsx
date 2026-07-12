'use client';

import { useEffect, useMemo, useState } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { COPY_SECTIONS, WIZARD_STEPS } from '@/lib/club-season-wizard';

type ClubSeason = { id: string; name: string; slug: string; is_current: boolean; start_date: string; end_date: string };
type WizardState = { id: string; status: string; preview: { summary?: string; warnings?: string[]; selectedSections?: string[] }; club_season_id: string | null; updated_at: string };

export default function StartNewSeasonPage() {
  const [seasons, setSeasons] = useState<ClubSeason[]>([]);
  const [states, setStates] = useState<WizardState[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: '', slug: '', startDate: '', endDate: '', sourceSeasonId: '', registrationStatus: 'closed', registrationUrl: '', playhqSeasonId: '', scheduledActivationAt: '', activateNow: false,
    copySections: Object.fromEntries(COPY_SECTIONS.map((section) => [section, ['teams','appointments','training','registration','notices','fantasy'].includes(section)])),
  });
  const preview = useMemo(() => {
    const selectedSections = Object.entries(form.copySections).filter(([, selected]) => selected).map(([key]) => key);
    const warnings = [] as string[];
    const now = new Date();
    if (form.startDate && Date.parse(form.startDate) < now.getTime()) warnings.push('Start date is in the past. Check this is not stale carry-forward content.');
    if (form.registrationUrl && /2025|2026/.test(form.registrationUrl) && !form.name.includes('2025') && !form.name.includes('2026')) warnings.push('Registration URL contains an older year. Review it before publishing.');
    return { selectedSections, warnings, summary: `${form.name || 'New season'} · ${form.startDate || 'no start'} to ${form.endDate || 'no end'}` };
  }, [form]);

  async function load() {
    const res = await fetch('/api/admin/club-seasons/wizard', { cache: 'no-store', credentials: 'include' });
    const json = await res.json();
    if (json.success) {
      setSeasons(json.seasons || []);
      setStates(json.states || []);
      const current = (json.seasons || []).find((season: ClubSeason) => season.is_current) || json.seasons?.[0];
      setForm((value) => ({ ...value, sourceSeasonId: value.sourceSeasonId || current?.id || '' }));
    } else setMessage(json.error || 'Could not load season wizard.');
  }

  async function saveDraft() {
    setBusy(true); setMessage('');
    const idempotencyKey = `${form.name}-${form.startDate}-${form.endDate}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    try {
      const res = await fetch('/api/admin/club-seasons/wizard', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey, currentStep: step, payload: { ...form, scheduledActivationAt: form.scheduledActivationAt || null } }) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.errors?.join(' ') || json.error || 'Could not save wizard.');
      setMessage(json.idempotent ? 'Existing draft resumed. No duplicate season was created.' : 'Season draft saved. Review before activation.');
      await load();
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Could not save wizard.'); }
    finally { setBusy(false); }
  }

  async function activate(stateId: string) {
    setBusy(true); setMessage('');
    const res = await fetch('/api/admin/club-seasons/wizard', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stateId, action: 'activate' }) });
    const json = await res.json();
    setMessage(json.success ? 'Season activated atomically. Previous current season was preserved in activation audit.' : json.error || 'Activation failed.');
    await load();
    setBusy(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-display font-bold text-gray-900">Start new season</h1><p className="mt-1 max-w-4xl text-sm text-gray-600">A committee-friendly workflow for preparing the next season without code, SQL or environment changes. Copied content starts as draft and inherited values are clearly marked for review.</p></div>
      {message && <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900" role="status">{message}</div>}
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card><CardContent><h2 className="text-lg font-display font-bold text-gray-900">Steps</h2><ol className="mt-3 space-y-1">{WIZARD_STEPS.map((label, index) => <li key={label}><button type="button" onClick={() => setStep(index + 1)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${step === index + 1 ? 'bg-maroon-700 text-white' : 'hover:bg-gray-50'}`}>{index + 1}. {label}</button></li>)}</ol></CardContent></Card>
        <Card><CardContent>
          <h2 className="text-lg font-display font-bold text-gray-900">{step}. {WIZARD_STEPS[step - 1]}</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold">Season name<input className="mt-1 w-full rounded-lg border px-3 py-2" value={form.name} placeholder="2027/2028 Season" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="text-sm font-semibold">Slug<input className="mt-1 w-full rounded-lg border px-3 py-2" value={form.slug} placeholder="2027-28" onChange={(e) => setForm({ ...form, slug: e.target.value })} /></label>
            <label className="text-sm font-semibold">Start date<input type="date" className="mt-1 w-full rounded-lg border px-3 py-2" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
            <label className="text-sm font-semibold">End date<input type="date" className="mt-1 w-full rounded-lg border px-3 py-2" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
            <label className="text-sm font-semibold">Copy from previous season<select className="mt-1 w-full rounded-lg border px-3 py-2" value={form.sourceSeasonId} onChange={(e) => setForm({ ...form, sourceSeasonId: e.target.value })}>{seasons.map((season) => <option key={season.id} value={season.id}>{season.name}{season.is_current ? ' (current)' : ''}</option>)}</select></label>
            <label className="text-sm font-semibold">Registration status<select className="mt-1 w-full rounded-lg border px-3 py-2" value={form.registrationStatus} onChange={(e) => setForm({ ...form, registrationStatus: e.target.value })}>{['closed','opening_soon','open','waitlist','archived'].map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}</select></label>
            <label className="text-sm font-semibold md:col-span-2">Registration URL<input className="mt-1 w-full rounded-lg border px-3 py-2" value={form.registrationUrl} placeholder="https://www.playhq.com/..." onChange={(e) => setForm({ ...form, registrationUrl: e.target.value })} /></label>
            <label className="text-sm font-semibold">PlayHQ season ID<input className="mt-1 w-full rounded-lg border px-3 py-2" value={form.playhqSeasonId} onChange={(e) => setForm({ ...form, playhqSeasonId: e.target.value })} /></label>
            <label className="text-sm font-semibold">Schedule activation<input type="datetime-local" className="mt-1 w-full rounded-lg border px-3 py-2" value={form.scheduledActivationAt} onChange={(e) => setForm({ ...form, scheduledActivationAt: e.target.value })} /></label>
          </div>
          <fieldset className="mt-5"><legend className="text-sm font-semibold">Sections to copy as draft</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{COPY_SECTIONS.map((section) => <label key={section} className="flex items-center gap-2 rounded-lg border p-2 text-sm"><input type="checkbox" checked={Boolean(form.copySections[section])} onChange={(e) => setForm({ ...form, copySections: { ...form.copySections, [section]: e.target.checked } })} />{section.replace(/([A-Z])/g, ' $1')}</label>)}</div></fieldset>
          <div className="mt-5 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900"><strong>Review preview:</strong> {preview.summary}<br />Copied sections: {preview.selectedSections.join(', ') || 'none'}{preview.warnings.map((warning) => <p key={warning} className="mt-2">Warning: {warning}</p>)}</div>
          <div className="mt-5 flex flex-wrap gap-3"><Button type="button" variant="secondary" onClick={() => setStep(Math.max(1, step - 1))}>Back</Button><Button type="button" variant="secondary" onClick={() => setStep(Math.min(WIZARD_STEPS.length, step + 1))}>Next</Button><Button type="button" onClick={saveDraft} disabled={busy}>Save draft and preview</Button></div>
        </CardContent></Card>
      </div>
      <Card><CardContent><h2 className="text-lg font-display font-bold text-gray-900">Resumable drafts</h2><div className="mt-3 space-y-3">{states.map((state) => <div key={state.id} className="rounded-lg border p-3"><p className="text-sm font-semibold">{state.preview?.summary || 'Season draft'} · {state.status}</p>{state.preview?.warnings?.map((warning) => <p key={warning} className="text-sm text-yellow-800">Warning: {warning}</p>)}<Button type="button" className="mt-3" onClick={() => activate(state.id)} disabled={busy || state.status === 'activated'}>Activate now</Button></div>)}</div></CardContent></Card>
    </div>
  );
}
