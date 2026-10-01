'use client';
import { useEffect, useId, useState } from 'react';

// Kitchen orders only: the purchaser pays cash at the bar on collection. The
// choice is recorded against the order and listed in the weekly kitchen export.
// A special request (required) is always paid at the bar: the box stays ticked
// and a missing stored choice is saved on load.
export default function BarPaymentChoice({ orderId, draftToken, onChange, disabled = false, refreshKey = 0, onBusyChange, onSaved, required = false }: {
  orderId: string; draftToken: string; onChange?: (selected: boolean) => void;
  disabled?: boolean; refreshKey?: number; onBusyChange?: (busy: boolean) => void; onSaved?: () => void; required?: boolean;
}) {
  const id = useId();
  const [selected, setSelected] = useState(false);
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
    fetch('/api/kitchen/orders/bar-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, draft_token: draftToken, action: 'read' }) })
      .then(async response => {
        const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to load your payment choice.');
        if (!active) return;
        setSelected(data.selected === true); onChange?.(data.selected === true);
        if (required && data.selected !== true) { await save(true); return; }
        setBusy(false);
      })
      .catch(reason => { if (active) { setError(reason instanceof Error ? reason.message : 'Unable to load your payment choice.'); setBusy(false); } });
    return () => { active = false; };
    // onChange is a notification only; reloading on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, draftToken, retry, refreshKey, required]);
  async function save(value: boolean) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/kitchen/orders/bar-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, draft_token: draftToken, selected: value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Your selection could not be saved.');
      setSelected(data.selected === true); onChange?.(data.selected === true); setMessage(data.message); onSaved?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Your selection could not be saved.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <label htmlFor={id} className="flex min-h-11 items-center gap-3 rounded-lg border border-edge-strong p-3 text-content-primary">
      <input id={id} type="checkbox" checked={required || selected} disabled={required || busy || disabled} onChange={event => void save(event.target.checked)} aria-describedby={`${id}-help`} className="h-4 w-4 accent-maroon-700" />
      I will pay cash at the bar
    </label>
    <p id={`${id}-help`} className="text-sm text-content-secondary">{required
      ? 'Your order includes a special request, so the kitchen confirms the final price and you pay cash at the bar when you collect. Your order is marked paid once the bar receives your payment.'
      : 'Tick to pay cash at the bar when you collect. Your order stays on the kitchen list and is marked paid once the bar receives your payment.'}</p>
    <p role="status" className="text-sm">{busy ? 'Checking payment choice...' : message || (selected ? 'Pay at the bar selected - please pay cash at the bar when you collect.' : '')}</p>
    {error && <div role="alert" className="text-sm text-red-700 dark:text-red-300">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="underline">Reload payment choice</button></div>}
  </div>;
}
