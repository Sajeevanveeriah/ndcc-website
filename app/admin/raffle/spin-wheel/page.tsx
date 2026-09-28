'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import { formatAud, formatMelbourneDateTime, type SpinWheelRow } from '@/lib/spin-wheel/rules';

type Row = SpinWheelRow & { spin_wheel_segments?: Array<{ count: number }>; spin_wheel_results?: Array<{ count: number }> };

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
