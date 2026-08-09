'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from 'lucide-react';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input, { Select, Textarea } from '@/components/ui/Input';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import {
  REGISTRATION_STATUSES,
  type RegistrationEditorSettings,
  type RegistrationOption,
} from '@/lib/player-registration';

type SeasonSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  is_current: boolean;
};

type RegistrationResponse = {
  success: boolean;
  seasons: SeasonSummary[];
  selectedSeason: SeasonSummary | null;
  settings: RegistrationEditorSettings | null;
  isNewDraft: boolean;
};

type Feedback = { type: 'success' | 'error' | 'info'; message: string } | null;

function toDateTimeLocal(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function reorderOptions(options: RegistrationOption[], from: number, to: number) {
  if (to < 0 || to >= options.length) return options;
  const next = [...options];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((option, index) => ({ ...option, sortOrder: index + 1 }));
}

export default function SeasonRegistrationAdminPage() {
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [settings, setSettings] = useState<RegistrationEditorSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isNewDraft, setIsNewDraft] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function load(seasonId?: string) {
    setLoading(true);
    setFeedback(null);
    try {
      const query = seasonId ? `?seasonId=${encodeURIComponent(seasonId)}` : '';
      const response = await adminFetch(`/api/admin/club-seasons/registration${query}`);
      const result = await parseApiResponse<RegistrationResponse>(response);
      setSeasons(result.seasons || []);
      setSelectedSeasonId(result.selectedSeason?.id || '');
      setSettings(result.settings || null);
      setIsNewDraft(Boolean(result.isNewDraft));
      if (result.isNewDraft) {
        setFeedback({
          type: 'info',
          message: 'This season starts closed and hidden. Terms and audience labels were copied where available; every old URL was cleared and every option was deactivated.',
        });
      }
    } catch (error) {
      setSettings(null);
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Registration settings could not be loaded.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function updateSettings(patch: Partial<RegistrationEditorSettings>) {
    setSettings((current) => current ? { ...current, ...patch } : current);
  }

  function updateOption(index: number, patch: Partial<RegistrationOption>) {
    if (!settings) return;
    updateSettings({ options: settings.options.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option) });
  }

  function addOption() {
    if (!settings || settings.options.length >= 12) return;
    const nextIndex = settings.options.length + 1;
    updateSettings({
      options: [...settings.options, { audienceKey: `audience_${nextIndex}`, label: '', url: '', sortOrder: nextIndex, active: false }],
    });
  }

  function removeOption(index: number) {
    if (!settings || settings.options.length <= 1) return;
    updateSettings({ options: settings.options.filter((_, optionIndex) => optionIndex !== index).map((option, optionIndex) => ({ ...option, sortOrder: optionIndex + 1 })) });
  }

  async function save() {
    if (!settings || !selectedSeasonId) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await adminFetch('/api/admin/club-seasons/registration', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonId: selectedSeasonId, settings }),
      });
      const result = await parseApiResponse<{ settings: RegistrationEditorSettings }>(response);
      setSettings(result.settings);
      setIsNewDraft(false);
      setFeedback({ type: 'success', message: 'Player registration settings saved. Public reads are uncached, so approved changes appear without a redeployment.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Registration settings could not be saved.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-content-primary">Player Registration</h1>
        <p className="mt-1 max-w-4xl text-sm text-content-muted">
          Manage one seasonal registration page, header label, PlayHQ choices and Terms and Conditions. Public content is read live from the selected current season.
        </p>
      </div>

      {feedback && (
        <div
          className={`rounded-lg border p-4 text-sm ${feedback.type === 'error' ? 'border-red-200 bg-red-50 text-red-900' : feedback.type === 'success' ? 'border-green-200 bg-green-50 text-green-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}
          role={feedback.type === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {feedback.message}
        </div>
      )}

      <Card>
        <CardContent className="p-6">
          <Select
            id="registration-season"
            label="Club season"
            value={selectedSeasonId}
            options={seasons.map((season) => ({ value: season.id, label: `${season.name}${season.is_current ? ' (current)' : ''}` }))}
            onChange={(event) => load(event.target.value)}
            disabled={loading || saving}
          />
          {isNewDraft && <p className="mt-2 text-sm text-content-muted">Saving creates this season&apos;s canonical settings row. It will remain unavailable publicly until valid links are activated and the status is published.</p>}
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-content-muted" role="status">Loading registration settings...</p>}

      {!loading && settings && (
        <>
          <Card>
            <CardHeader><h2 className="text-lg font-display font-bold text-content-primary">Page and publication</h2></CardHeader>
            <CardContent className="grid gap-5 p-6 md:grid-cols-2">
              <Input id="registration-page-title" label="Page title" value={settings.pageTitle} maxLength={160} onChange={(event) => updateSettings({ pageTitle: event.target.value })} />
              <Input id="registration-navigation-label" label="Header navigation label" value={settings.navigationLabel} maxLength={120} onChange={(event) => updateSettings({ navigationLabel: event.target.value })} />
              <div className="md:col-span-2"><Textarea id="registration-intro" label="Introductory text" value={settings.introText} maxLength={1000} onChange={(event) => updateSettings({ introText: event.target.value })} /></div>
              <Select
                id="registration-status"
                label="Registration status"
                value={settings.status}
                options={REGISTRATION_STATUSES.map((status) => ({ value: status, label: status.replace(/_/g, ' ') }))}
                onChange={(event) => updateSettings({ status: event.target.value as RegistrationEditorSettings['status'] })}
              />
              <label className="flex min-h-11 items-center gap-3 rounded-lg border border-edge-subtle px-4 py-3 text-sm font-semibold">
                <input type="checkbox" className="h-5 w-5 accent-maroon-700" checked={settings.showInNavigation} onChange={(event) => updateSettings({ showInNavigation: event.target.checked })} />
                Show seasonal registration in the header
              </label>
              <Input id="registration-opens" type="datetime-local" label="Opens at (optional)" value={toDateTimeLocal(settings.opensAt)} onChange={(event) => updateSettings({ opensAt: fromDateTimeLocal(event.target.value) })} />
              <Input id="registration-closes" type="datetime-local" label="Closes at (optional)" value={toDateTimeLocal(settings.closesAt)} onChange={(event) => updateSettings({ closesAt: fromDateTimeLocal(event.target.value) })} />
              <p className="md:col-span-2 text-sm text-content-muted">Open and waitlist statuses require at least one active valid option. Closed, archived or expired settings never expose a clickable registration link.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-display font-bold text-content-primary">Registration options</h2>
                <p className="mt-1 text-sm text-content-muted">Only HTTPS links on the exact www.playhq.com cricket registration path are accepted.</p>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={addOption} disabled={settings.options.length >= 12}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />Add option
              </Button>
            </CardHeader>
            <CardContent className="space-y-5 p-6">
              {settings.options.map((option, index) => (
                <fieldset key={index} className="rounded-xl border border-edge-subtle p-4">
                  <legend className="px-2 text-sm font-bold text-maroon-700 dark:text-maroon-200">Option {index + 1}</legend>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input id={`registration-audience-${index}`} label="Stable audience key" value={option.audienceKey} maxLength={64} onChange={(event) => updateOption(index, { audienceKey: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} />
                    <Input id={`registration-label-${index}`} label="Audience label" value={option.label} maxLength={120} onChange={(event) => updateOption(index, { label: event.target.value })} />
                    <div className="md:col-span-2">
                      <Input id={`registration-url-${index}`} type="url" label="PlayHQ registration URL" value={option.url} placeholder="https://www.playhq.com/cricket-australia/register/..." onChange={(event) => updateOption(index, { url: event.target.value })} />
                    </div>
                    <label className="flex min-h-11 items-center gap-3 rounded-lg border border-edge-subtle px-4 py-3 text-sm font-semibold">
                      <input type="checkbox" className="h-5 w-5 accent-maroon-700" checked={option.active} onChange={(event) => updateOption(index, { active: event.target.checked })} />
                      Active on the public page
                    </label>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button type="button" size="sm" variant="ghost" className="min-h-11 min-w-11" onClick={() => updateSettings({ options: reorderOptions(settings.options, index, index - 1) })} disabled={index === 0} aria-label={`Move ${option.label || `option ${index + 1}`} up`}><ArrowUp className="h-4 w-4" aria-hidden="true" /></Button>
                      <Button type="button" size="sm" variant="ghost" className="min-h-11 min-w-11" onClick={() => updateSettings({ options: reorderOptions(settings.options, index, index + 1) })} disabled={index === settings.options.length - 1} aria-label={`Move ${option.label || `option ${index + 1}`} down`}><ArrowDown className="h-4 w-4" aria-hidden="true" /></Button>
                      <Button type="button" size="sm" variant="danger" className="min-h-11 min-w-11" onClick={() => removeOption(index)} disabled={settings.options.length <= 1} aria-label={`Remove ${option.label || `option ${index + 1}`}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                    </div>
                  </div>
                </fieldset>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-display font-bold text-content-primary">Terms and Conditions</h2>
              <p className="mt-1 text-sm text-content-muted">Edit all six headings and bodies as ordinary text. The public page renders semantic HTML without injecting markup.</p>
            </CardHeader>
            <CardContent className="space-y-5 p-6">
              <Input id="registration-terms-title" label="Terms title" value={settings.termsTitle} maxLength={200} onChange={(event) => updateSettings({ termsTitle: event.target.value })} />
              {settings.termsSections.map((section, index) => (
                <fieldset key={index} className="rounded-xl border border-edge-subtle p-4">
                  <legend className="px-2 text-sm font-bold text-maroon-700 dark:text-maroon-200">Terms section {index + 1}</legend>
                  <div className="space-y-4">
                    <Input id={`registration-terms-heading-${index}`} label="Heading" value={section.heading} maxLength={160} onChange={(event) => updateSettings({ termsSections: settings.termsSections.map((item, itemIndex) => itemIndex === index ? { ...item, heading: event.target.value } : item) })} />
                    <Textarea id={`registration-terms-body-${index}`} label="Body" value={section.body} maxLength={8000} onChange={(event) => updateSettings({ termsSections: settings.termsSections.map((item, itemIndex) => itemIndex === index ? { ...item, body: event.target.value } : item) })} />
                  </div>
                </fieldset>
              ))}
            </CardContent>
          </Card>

          <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge-subtle bg-surface-card p-4 shadow-lg">
            <p className="text-sm text-content-muted"><ExternalLink className="mr-1 inline h-4 w-4" aria-hidden="true" />Public registration links open PlayHQ in a new tab.</p>
            <Button type="button" onClick={save} isLoading={saving} disabled={saving}>{saving ? 'Saving...' : 'Save registration settings'}</Button>
          </div>
        </>
      )}
    </div>
  );
}
