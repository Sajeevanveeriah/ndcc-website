'use client';
import { useEffect, useState } from 'react';
// `product` applies that product's bank deposit switch (raffle, reverse_raffle,
// dino or donation); omitted, the general capability is used.
export default function PaymentMethodChoice({ method, onChange, product }: { method: 'stripe' | 'bank_transfer'; onChange: (method: 'stripe' | 'bank_transfer') => void; product?: 'raffle' | 'reverse_raffle' | 'dino' | 'donation' }) {
  const [capabilities, setCapabilities] = useState<{ card: boolean; bank_transfer: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    fetch(product ? `/api/payments/capabilities?product=${product}` : '/api/payments/capabilities', { cache: 'no-store' }).then(async response => {
      const result = await response.json();
      if (active && response.ok && result.data) setCapabilities(result.data);
    }).catch(() => {});
    return () => { active = false; };
  }, [product]);
  useEffect(() => {
    if (capabilities?.bank_transfer && !capabilities.card && method !== 'bank_transfer') onChange('bank_transfer');
    if (capabilities?.card && !capabilities.bank_transfer && method !== 'stripe') onChange('stripe');
  }, [capabilities, method, onChange]);
  if (!capabilities?.bank_transfer) return null;
  return <div className="space-y-2"><label className="flex min-h-11 items-center gap-3 rounded-lg border border-edge-strong p-3"><input type="checkbox" checked={method === 'bank_transfer'} disabled={!capabilities.card} onChange={event => onChange(event.target.checked ? 'bank_transfer' : 'stripe')} className="h-4 w-4 accent-maroon-700" />I am paying by bank transfer (bank deposit)</label><p className="text-sm text-content-secondary">{method === 'bank_transfer' ? 'Your choice will be recorded with your order. The club confirms payment once the deposit is received.' : 'Leave unticked to pay by card.'}</p></div>;
}
