'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import { formatAud, formatMelbourneDateTime, type SpinWheelRow } from '@/lib/spin-wheel/rules';

type Row = SpinWheelRow & { spin_wheel_segments?: Array<{ count: number }>; spin_wheel_results?: Array<{ count: number }> };

// CMS show/hide switch for the whole feature. Hiding keeps every wheel,
// prize, pass, order and result; showing again restores it as configured.
function PublicSwitch() {
  const [state, setState] = useState<{ enabled: boolean; available: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    adminFetch('/api/admin/spin-wheel/visibility').then(response => parseApiResponse<{ enabled: boolean; available: boolean }>(response))
      .then(data => setState({ enabled: data.enabled, available: data.available }))
      .catch(failure => setMessage(failure instanceof Error ? failure.message : 'The setting could not be loaded.'));
  }, []);
  const save = async (enabled: boolean, confirmClose = false) => {
    setSaving(true);
    setMessage('');
    try {
      const response = await adminFetch('/api/admin/spin-wheel/visibility', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, confirm_close: confirmClose }) });
      if (response.status === 409) {
        const body = await response.clone().json().catch(() => null) as { needsConfirmation?: boolean; error?: string } | null;
        if (body?.needsConfirmation) {
          setSaving(false);
          if (window.confirm(`${body.error}\n\nHide Spin the Wheel anyway?`)) await save(enabled, true);
          else setMessage('Nothing was changed.');
          return;
        }
      }
      const data = await parseApiResponse<{ enabled: boolean }>(response);
      setState(previous => ({ available: previous?.available ?? true, enabled: data.enabled }));
      setMessage(data.enabled ? 'Spin the Wheel is shown on the website.' : 'Spin the Wheel is hidden from the website. All wheels and results are kept.');
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'The setting could not be saved.');
    } finally {
      setSaving(false);
    }
  };
  return <section aria-labelledby="spin-public-switch" className="rounded-xl border border-edge-subtle p-4">
    <h2 id="spin-public-switch" className="font-display text-lg font-semibold">Show on website</h2>
    {state && !state.available && <p role="status" className="mt-1 text-sm">Apply the Spin the Wheel show/hide migration to use this switch. The feature is shown as before until then.</p>}
    {state && state.available && <label className="mt-2 flex items-start gap-3">
      <input type="checkbox" className="mt-1 h-5 w-5 accent-maroon-700" checked={state.enabled} disabled={saving} onChange={event => void save(event.target.checked)} aria-describedby="spin-public-switch-help" />
      <span><span className="font-semibold">Show Spin the Wheel on the public website</span>
        <span id="spin-public-switch-help" className="block text-sm text-content-muted">When off, the page, menu link, member dashboard link and spins are hidden. Wheels, prizes, passes, paid spins, orders and results are kept, and each wheel&apos;s own visibility applies again when it is turned back on.</span></span>
    </label>}
    {!state && !message && <p role="status" className="mt-1 text-sm">Loading setting...</p>}
    {message && <p role="status" className="mt-2 text-sm font-semibold">{message}</p>}
  </section>;
}

const STATUS_LABELS: Record<string, string> = { draft: 'Draft', live: 'Live', paused: 'Paused', ended: 'Ended' };

export default function SpinWheelListPage() {
  const [wheels, setWheels] = useState<Row[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    adminFetch('/api/admin/spin-wheel').then(response => parseApiResponse<{ wheels: Row[]; available: boolean }>(response))
      .then(data => { setWheels(data.wheels); setAvailable(data.available); })
      .catch(failure => setError(failure instanceof Error ? failure.message : 'Wheels could not be loaded.'));
  }, []);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Link href="/admin/raffle" className="text-sm underline">Raffle</Link>
        <h1 className="text-2xl font-display font-bold">Spin the Wheel</h1>
        <p className="text-content-muted">Online wheels people spin on the website. Separate from the Prize Wheel raffle drawn at the clubrooms.</p>
      </div>
      {available && <Link href="/admin/raffle/spin-wheel/new" className="btn-primary">New wheel</Link>}
    </div>
    <PublicSwitch />
    {error && <p role="alert">{error}</p>}
    {!available && <p role="status">Spin the Wheel is not set up in the database yet. Apply the Spin the Wheel migration first.</p>}
    {!wheels && !error && <p role="status">Loading wheels...</p>}
    {wheels && available && (wheels.length === 0 ? <p>No wheels yet.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <caption className="sr-only">Spin the Wheel wheels</caption>
      <thead><tr>{['Wheel', 'Status', 'Public page', 'Runs', 'Spins', 'Price'].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
      <tbody>{wheels.map(wheel => <tr key={wheel.id} className="border-t border-edge-subtle">
        <td className="p-3"><Link className="font-semibold underline" href={`/admin/raffle/spin-wheel/${wheel.id}`}>{wheel.name}</Link><br />{wheel.spin_wheel_segments?.[0]?.count ?? 0} segments</td>
        <td className="p-3">{STATUS_LABELS[wheel.status] || wheel.status}</td>
        <td className="p-3">{wheel.public_visibility_mode === 'visible' ? 'Visible' : wheel.public_visibility_mode === 'scheduled' ? `From ${formatMelbourneDateTime(wheel.public_opens_at)}` : 'Hidden'}</td>
        <td className="p-3">{wheel.starts_at ? formatMelbourneDateTime(wheel.starts_at) : 'Any time'}{wheel.ends_at ? ` to ${formatMelbourneDateTime(wheel.ends_at)}` : ''}</td>
        <td className="p-3">{wheel.spin_wheel_results?.[0]?.count ?? 0}</td>
        <td className="p-3">{wheel.spin_price_cents ? formatAud(wheel.spin_price_cents) : 'Free only'}</td>
      </tr>)}</tbody>
    </table></div>)}
  </div>;
}
