'use client';
import { useEffect, useId, useState } from 'react';

export default function BankTransferChoice({ orderId, email, balanceToken, initialSelected = false }: {
  orderId: string; email?: string; balanceToken?: string; initialSelected?: boolean;
}) {
  const id = useId();
  const [selected, setSelected] = useState(initialSelected);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setBusy(true); setError(''); setMessage('');
    fetch('/api/payments/bank-transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, email, token: balanceToken, action: 'read' }) })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to load your payment choice.'); if (active) setSelected(data.selected === true); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load your payment choice.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [orderId, email, balanceToken, retry]);
  async function save(value: boolean) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/payments/bank-transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, email, token: balanceToken, selected: value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Your selection could not be saved.');
      setSelected(data.selected === true); setMessage(data.message);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Your selection could not be saved.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <label htmlFor={id} className="flex min-h-11 items-center gap-3 rounded-lg border border-edge-strong p-3 text-content-primary">
      <input id={id} type="checkbox" checked={selected} disabled={busy} onChange={event => void save(event.target.checked)} aria-describedby={`${id}-help`} className="h-4 w-4 accent-maroon-700" />
      I am paying by bank transfer (bank deposit)
    </label>
    <p id={`${id}-help`} className="text-sm text-content-secondary">Tick to let the club know. Use your order reference with the deposit. Payment remains unconfirmed until the club records the funds received.</p>
    <p role="status" className="text-sm">{busy ? 'Checking payment choice...' : message || (selected ? 'Bank transfer selected - awaiting receipt confirmation.' : '')}</p>
    {error && <div role="alert" className="text-sm text-red-700 dark:text-red-300">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="underline">Reload payment choice</button></div>}
  </div>;
}
