'use client';
import { useEffect, useState } from 'react';
import { type KitchenOrderingSettings, validKitchenSettings } from '@/lib/kitchen-order-window';
import Button from '@/components/ui/Button';
export default function KitchenOrderingControls() {
  const [settings, setSettings] = useState<KitchenOrderingSettings | null>(null);
  const [saved, setSaved] = useState<KitchenOrderingSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    fetch('/api/admin/kitchen/settings', { cache: 'no-store' }).then(async res => {
      const body = await res.json();
      if (!res.ok || !validKitchenSettings(body.data)) throw new Error('Could not load ordering settings. Reload to try again.');
      setSettings(body.data); setSaved(body.data);
    }).catch(error => setMessage(error.message));
  }, []);
  async function save(value: KitchenOrderingSettings) {
    setBusy(true); setMessage('');
    try {
      const res = await fetch('/api/admin/kitchen/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
      const body = await res.json();
      if (!res.ok || !validKitchenSettings(body.data)) throw new Error(body.error || 'Could not save ordering settings.');
      setSettings(body.data); setSaved(body.data);
      setMessage(body.data.enabled ? 'Saved. Orders follow the weekly schedule.' : 'Saved. Online meal orders are disabled until you enable them again.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save ordering settings.'); }
    finally { setBusy(false); }
  }
  return <section className="bg-surface-card rounded-xl border p-5 space-y-4" aria-labelledby="ordering-heading">
    <h2 id="ordering-heading" className="text-lg font-semibold">Online meal ordering</h2>
    <p className="text-sm">Meals are served on Thursdays. All opening and closing times are Australia/Melbourne. Collection times remain Juniors 6:00 pm and Seniors 7:30 pm.</p>
    <p className="font-semibold">Saved status: {saved ? saved.enabled ? 'Enabled - weekly schedule applies' : 'Disabled - orders closed' : 'Loading settings...'}</p>
    {settings && <form onSubmit={event => { event.preventDefault(); if (validKitchenSettings(settings)) void save(settings); else setMessage('Choose an opening time before the closing time.'); }} className="space-y-4">
      <fieldset disabled={busy} className="space-y-4">
        <legend className="sr-only">Ordering availability and weekly schedule</legend>
        <label className="flex items-center gap-3"><input type="checkbox" checked={settings.enabled} onChange={event => setSettings({ ...settings, enabled: event.target.checked })} className="h-5 w-5" />Enable online meal orders</label>
        <p className="text-sm text-content-secondary">Enable or disable orders whenever needed. When enabled, the weekly schedule below applies. Changes apply when saved.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(['open', 'close'] as const).map(kind => <fieldset key={kind} className="space-y-2 min-w-0">
            <legend className="font-medium">{kind === 'open' ? 'Orders open' : 'Orders close'}</legend>
            <label className="block text-sm">Day<select className="block w-full rounded border p-2 bg-surface-page" value={settings[`${kind}_day`]} onChange={event => setSettings({ ...settings, [`${kind}_day`]: Number(event.target.value) })}>{['Monday', 'Tuesday', 'Wednesday', 'Thursday'].map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label>
            <label className="block text-sm">Time<input required type="time" className="block w-full rounded border p-2 bg-surface-page" value={settings[`${kind}_time`]} onChange={event => setSettings({ ...settings, [`${kind}_time`]: event.target.value })} /></label>
          </fieldset>)}
        </div>
        <div className="flex flex-wrap gap-3"><Button type="submit">{busy ? 'Saving...' : 'Save ordering settings'}</Button>{saved?.enabled && <Button type="button" onClick={() => void save({ ...saved, enabled: false })}>Close orders now</Button>}</div>
      </fieldset>
    </form>}
    <p role="status" aria-live="polite" className="text-sm">{message}</p>
  </section>;
}
