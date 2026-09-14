'use client';

import { useEffect, useState } from 'react';
import { mealCollectionLabel, mealServiceLabel } from '../../lib/meal-collection';

export default function MealPaymentSummary() {
  const [order, setOrder] = useState<{ collection_window: string; service_date: string; payment_status: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const draft = JSON.parse(sessionStorage.getItem('ndcc-meal-draft-v1') || 'null');
        if (!draft?.token) throw new Error('Return to Kitchen to view your meal order.');
        const response = await fetch('/api/kitchen/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'resume', draft_token: draft.token }) });
        if (!response.ok) throw new Error('Your meal details could not be loaded. Return to Kitchen to retry.');
        const result = await response.json();
        if (active) setOrder(result);
      } catch (error) { if (active) setError(error instanceof Error ? error.message : 'Unable to load meal details.'); }
    })();
    return () => { active = false; };
  }, []);
  return <div aria-live="polite" className="space-y-2">
    {order ? <><p className="font-semibold">{mealCollectionLabel(order.collection_window)}</p>
      <p>{mealServiceLabel(order.service_date)} (Australia/Melbourne)</p>
      <p>{order.payment_status === 'paid' ? 'Payment confirmed.' : 'Payment has not yet been confirmed for this order.'}</p></>
      : <p>{error || 'Loading your meal collection details...'}</p>}
  </div>;
}
