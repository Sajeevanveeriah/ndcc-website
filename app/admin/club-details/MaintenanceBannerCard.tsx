'use client';

import { useEffect, useMemo, useState } from 'react';
import { Wrench } from 'lucide-react';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import { clubWallTimeProblem, datetimeLocalToClubIso, toDatetimeLocalInClubTimezone } from '@/lib/utils';
import { MAINTENANCE_MESSAGE_MAX, maintenanceBannerText, maintenancePhase, type MaintenanceSettings } from '@/lib/maintenance-banner';

type Form = { enabled: boolean; starts: string; ends: string; message: string };
type Response = { available: boolean; settings: MaintenanceSettings };

const toForm = (settings: MaintenanceSettings): Form => ({
  enabled: settings.enabled,
  starts: settings.starts_at ? toDatetimeLocalInClubTimezone(settings.starts_at) : '',
  ends: settings.ends_at ? toDatetimeLocalInClubTimezone(settings.ends_at) : '',
  message: settings.message ?? '',
});

const toIso = (value: string) => (value ? datetimeLocalToClubIso(value) : null);

/** Times in the hour skipped or repeated at a daylight saving change would silently map to the wrong instant. */
function clubTimeError(label: string, value: string): string {
  const problem = value ? clubWallTimeProblem(value) : null;
  if (problem === 'skipped') return `The ${label} time does not exist in Melbourne because the clocks go forward then. Choose another time.`;
  if (problem === 'repeated') return `The ${label} time happens twice in Melbourne because the clocks go back then. Choose a time outside that hour.`;
  return '';
}

/** CMS control for the maintenance banner shown at the top of every page. */
export default function MaintenanceBannerCard() {
  const [form, setForm] = useState<Form>({ enabled: false, starts: '', ends: '', message: '' });
  const [saved, setSaved] = useState<MaintenanceSettings | null>(null);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    adminFetch('/api/admin/maintenance-banner', { cache: 'no-store' })
      .then((response) => parseApiResponse<Response>(response))
      .then((result) => { setAvailable(result.available); setSaved(result.settings); setForm(toForm(result.settings)); })
      .catch((error) => setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'The maintenance banner setting could not be loaded.' }))
      .finally(() => setLoading(false));
  }, []);

  const timeError = clubTimeError('start', form.starts) || clubTimeError('end', form.ends);

  // Exactly what visitors will read, worded for the current time.
  const preview = useMemo(() => {
    if (clubTimeError('start', form.starts) || clubTimeError('end', form.ends)) return null;
    const startsAt = toIso(form.starts);
    if (!startsAt || Number.isNaN(Date.parse(startsAt))) return null;
    const banner = { startsAt, endsAt: toIso(form.ends), message: form.message.trim() || null };
    const phase = maintenancePhase(banner, Date.now());
    return { phase, text: maintenanceBannerText(banner, phase === 'ended' ? 'upcoming' : phase) };
  }, [form.starts, form.ends, form.message]);

  const status = saved?.enabled
    ? (saved.ends_at && Date.parse(saved.ends_at) <= Date.now() ? 'On, but the end time has passed, so it is hidden' : 'On: showing on every page')
    : 'Off';

  async function save(enabled: boolean) {
    if (timeError) { setFeedback({ type: 'error', message: timeError }); return; }
    setSaving(true); setFeedback(null);
    try {
      const response = await adminFetch('/api/admin/maintenance-banner', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, starts_at: toIso(form.starts), ends_at: toIso(form.ends), message: form.message }),
      });
      const result = await parseApiResponse<Response>(response);
      setSaved(result.settings); setForm(toForm(result.settings));
      setFeedback({ type: 'success', message: enabled ? 'Maintenance banner is on. It shows at the top of every page.' : 'Maintenance banner is off.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'The maintenance banner could not be saved.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardContent className="p-6 space-y-5">
        <div>
          <h2 id="maintenance-banner-title" className="flex items-center gap-2 text-lg font-display font-bold text-content-primary">
            <Wrench className="h-5 w-5 text-maroon-700 dark:text-maroon-200" aria-hidden="true" />
            Maintenance banner
          </h2>
          <p className="mt-1 text-sm text-content-muted">
            Shows a notice with the maintenance times at the top of every page. While it is on, visitors see it straight away as advance notice.
            From the start time it reads &quot;Maintenance in progress&quot;, and it hides itself at the end time.
          </p>
          {!loading && available && <p className="mt-2 text-sm font-semibold text-content-primary" role="status">Current setting: {status}</p>}
        </div>

        {loading ? <p role="status" className="text-sm text-content-muted">Loading maintenance banner...</p> : !available ? (
          <p role="alert" className="text-sm text-amber-800 dark:text-amber-200">The maintenance banner needs the latest database update before it can be used.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input id="maintenance-starts" type="datetime-local" label="Maintenance starts - Australia/Melbourne" required value={form.starts}
                onChange={(event) => setForm({ ...form, starts: event.target.value })} disabled={saving} />
              <Input id="maintenance-ends" type="datetime-local" label="Maintenance ends - Australia/Melbourne (blank = until further notice)" value={form.ends}
                onChange={(event) => setForm({ ...form, ends: event.target.value })} disabled={saving} />
            </div>
            <label htmlFor="maintenance-message" className="block text-sm font-semibold text-content-primary">
              Extra message (optional)
              <textarea id="maintenance-message" rows={2} maxLength={MAINTENANCE_MESSAGE_MAX} value={form.message} disabled={saving}
                onChange={(event) => setForm({ ...form, message: event.target.value })} aria-describedby="maintenance-message-help"
                className="mt-1 block w-full rounded-lg border border-edge-strong bg-surface-card px-3 py-2 font-normal" />
              <span id="maintenance-message-help" className="mt-1 block text-xs font-normal text-content-muted">
                Added after the times, for example what will not work. {form.message.length}/{MAINTENANCE_MESSAGE_MAX} characters.
              </span>
            </label>

            <div>
              <p className="text-sm font-semibold text-content-primary">Preview</p>
              {preview?.text ? (
                <div className="mt-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50" aria-live="polite">
                  <strong className="font-semibold">{preview.text.heading}.</strong> {preview.text.detail}
                  {preview.phase === 'ended' && <span className="mt-1 block font-semibold">This end time has already passed, so the banner would not show.</span>}
                </div>
              ) : timeError ? <p role="alert" className="mt-1 text-sm text-red-600">{timeError}</p>
                : <p className="mt-1 text-sm text-content-muted">Enter a start time to see the banner text.</p>}
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              {saved?.enabled && <Button type="button" variant="secondary" onClick={() => void save(false)} isLoading={saving}>Switch banner off</Button>}
              <Button type="button" onClick={() => void save(true)} isLoading={saving}>{saved?.enabled ? 'Save banner changes' : 'Show banner on every page'}</Button>
            </div>
          </>
        )}
        {feedback && <p role={feedback.type === 'error' ? 'alert' : 'status'} className={`text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.message}</p>}
      </CardContent>
    </Card>
  );
}
