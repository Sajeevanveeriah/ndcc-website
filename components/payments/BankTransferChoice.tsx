'use client';
import { useEffect, useId, useState } from 'react';

// The optional props let a parent coordinate this with another payment choice
// (the kitchen's pay-at-the-bar): lock it while the other is saving, re-read
// the saved choice after either saves, and hear when this one is busy.
export default function BankTransferChoice({ orderId, email, balanceToken, initialSelected = false, disabled = false, refreshKey = 0, onBusyChange, onSaved }: {
  orderId: string; email?: string; balanceToken?: string; initialSelected?: boolean;
  disabled?: boolean; refreshKey?: number; onBusyChange?: (busy: boolean) => void; onSaved?: () => void;
}) {
  const id = useId();
  const [selected, setSelected] = useState(initialSelected);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  // A notification only; depending on its identity would re-run the effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onBusyChange?.(busy); }, [busy]);
  // Hidden mid-request (a bar choice hides the bank control), it must not leave the other control locked.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onBusyChange?.(false), []);
  useEffect(() => {
    let active = true; setBusy(true); setError(''); setMessage('');
    fetch('/api/payments/bank-transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, email, token: balanceToken, action: 'read' }) })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to load your payment choice.'); if (active) setSelected(data.selected === true); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load your payment choice.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [orderId, email, balanceToken, retry, refreshKey]);
  async function save(value: boolean) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/payments/bank-transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, email, token: balanceToken, selected: value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Your selection could not be saved.');
      setSelected(data.selected === true); setMessage(data.message); onSaved?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Your selection could not be saved.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <label htmlFor={id} className="flex min-h-11 items-center gap-3 rounded-lg border border-edge-strong p-3 text-content-primary">
      <input id={id} type="checkbox" checked={selected} disabled={busy || disabled} onChange={event => void save(event.target.checked)} aria-describedby={`${id}-help`} className="h-4 w-4 accent-maroon-700" />
      I am paying by bank transfer (bank deposit)
    </label>
    <p id={`${id}-help`} className="text-sm text-content-secondary">Tick to let the club know. Use your order reference with the deposit. Payment remains unconfirmed until the club records the funds received.</p>
    <p role="status" className="text-sm">{busy ? 'Checking payment choice...' : message || (selected ? 'Bank transfer selected - awaiting receipt confirmation.' : '')}</p>
    {error && <div role="alert" className="text-sm text-red-700 dark:text-red-300">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="underline">Reload payment choice</button></div>}
  </div>;
}
