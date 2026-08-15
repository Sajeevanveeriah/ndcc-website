'use client';

import { useEffect, useMemo, useState } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

type ClubSeason = { id: string; name: string; is_current: boolean };
type SeasonDraft = { name: string; slug: string; startDate: string; endDate: string };
type WizardState = { id: string; status: string; preview: { summary?: string; warnings?: string[] }; updated_at: string };

const emptyDraft: SeasonDraft = { name: '', slug: '', startDate: '', endDate: '' };

export default function StartNewSeasonPage() {
  const [seasons, setSeasons] = useState<ClubSeason[]>([]);
  const [states, setStates] = useState<WizardState[]>([]);
  const [form, setForm] = useState<SeasonDraft>(emptyDraft);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const currentSeason = seasons.find((season) => season.is_current) || null;
  const complete = Boolean(form.name && form.startDate && form.endDate && form.endDate >= form.startDate);
  const summary = useMemo(() => `${form.name || 'New season'} · ${form.startDate || 'start date needed'} to ${form.endDate || 'end date needed'}`, [form]);

  async function load() {
    const response = await fetch('/api/admin/club-seasons/wizard', { cache: 'no-store', credentials: 'include' });
    const json = await response.json();
    if (!response.ok || !json.success) {
      setMessage(json.error || 'Could not load season setup.');
      return;
    }
    setSeasons(json.seasons || []);
    setStates(json.states || []);
    setForm((previous) => previous.name ? previous : (json.suggestedSeason || emptyDraft));
  }

  async function prepareSeason() {
    if (!complete) {
      setMessage('Enter a season name and valid start and end dates.');
      return;
    }
    setBusy(true);
    setMessage('');
    const idempotencyKey = `${form.name}-${form.startDate}-${form.endDate}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    try {
      const response = await fetch('/api/admin/club-seasons/wizard', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey, currentStep: 2, payload: { ...form, sourceSeasonId: currentSeason?.id || null } }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.errors?.join(' ') || json.error || 'Could not prepare the season.');
      setMessage(json.idempotent ? 'This season draft already exists. Review it below.' : 'Season prepared safely. Registration starts closed and seasonal pages will follow this season when activated.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not prepare the season.');
    } finally {
      setBusy(false);
    }
  }

  async function activate(stateId: string) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/club-seasons/wizard', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stateId, action: 'activate' }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'Activation failed.');
      setMessage('Season activated. Season-aware pages now use it automatically.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Activation failed.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-content-primary">Start next season</h1>
        <p className="mt-1 text-sm text-content-muted">Prepare the next season with four details. Registration starts closed, old signings stay with their original season, and season-aware public pages update when the new season is activated.</p>
      </div>

      {message && <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900" role="status">{message}</div>}

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="season-name" label="Season name" value={form.name} placeholder="2027/2028 Season" onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} required />
            <Input id="season-start" label="Season starts" type="date" value={form.startDate} onChange={(event) => setForm((previous) => ({ ...previous, startDate: event.target.value }))} required />
            <Input id="season-end" label="Season ends" type="date" value={form.endDate} onChange={(event) => setForm((previous) => ({ ...previous, endDate: event.target.value }))} required />
          </div>

          <button type="button" className="text-sm font-semibold text-maroon-700 hover:underline dark:text-maroon-200" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((value) => !value)}>
            {showAdvanced ? 'Hide advanced option' : 'Show advanced option'}
          </button>
          {showAdvanced && (
            <Input id="season-slug" label="Web address label" value={form.slug} placeholder="2027-28" onChange={(event) => setForm((previous) => ({ ...previous, slug: event.target.value }))} />
          )}

          <div className="rounded-lg border border-edge-subtle bg-surface-page p-4 text-sm">
            <p className="font-semibold text-content-primary">Review</p>
            <p className="mt-1 text-content-muted">{summary}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-content-muted">
              <li>Player registration starts closed.</li>
              <li>Season signings start empty and appear only after they are added.</li>
              <li>Sponsors remain in one shared A-Z list.</li>
              <li>Current-season labels update automatically after activation.</li>
            </ul>
          </div>

          <Button type="button" onClick={prepareSeason} disabled={busy || !complete}>{busy ? 'Preparing...' : 'Prepare season'}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-display font-bold text-content-primary">Prepared seasons</h2>
          <div className="mt-3 space-y-3">
            {states.length === 0 && <p className="text-sm text-content-muted">No prepared season drafts.</p>}
            {states.map((state) => (
              <div key={state.id} className="flex flex-col gap-3 rounded-lg border border-edge-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-content-primary">{state.preview?.summary || 'Season draft'}</p>
                  <p className="text-xs uppercase tracking-wide text-content-muted">{state.status}</p>
                  {state.preview?.warnings?.map((warning) => <p key={warning} className="mt-1 text-sm text-amber-800">{warning}</p>)}
                </div>
                <Button type="button" onClick={() => activate(state.id)} disabled={busy || state.status === 'activated'}>{state.status === 'activated' ? 'Active' : 'Activate season'}</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
