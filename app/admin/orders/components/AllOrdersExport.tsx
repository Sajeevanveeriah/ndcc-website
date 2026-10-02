'use client';

import { useState } from 'react';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import { purchaseGroupLabel } from '@/lib/orders/purchase-groups';
import Button from '@/components/ui/Button';

/** Every order (paid and unpaid) with the stated payment method and how money arrived. */
export default function AllOrdersExport({ group, setMessage }: { group: string; setMessage: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="mb-6 bg-surface-card rounded-xl border border-edge-subtle p-4 space-y-3">
      <h2 className="font-display font-bold text-content-primary">Export orders with payment methods</h2>
      <p className="text-xs text-content-muted">
        One row per order, paid and unpaid: the stated method (Stripe checkout, bank transfer or pay at the club), who recorded it,
        and the amounts actually received by cash or card at the club, bank transfer, Stripe or other.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const data = new FormData(event.currentTarget);
          const params = new URLSearchParams();
          if (data.get('scope') === 'tab') params.set('group', group);
          for (const key of ['date_from', 'date_to'] as const) {
            const value = String(data.get(key) || '').trim();
            if (value) params.set(key, value);
          }
          setBusy(true);
          setMessage('');
          try {
            const response = await adminFetch(`/api/admin/orders/export-all?${params}`);
            if (!response.ok) { await parseApiResponse(response); return; }
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'NDCC-All-Orders.csv';
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            setMessage('Orders export downloaded.');
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Unable to export orders.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="w-56">
          <label htmlFor="all-orders-scope" className="form-label text-xs">Orders</label>
          <select id="all-orders-scope" name="scope" defaultValue="tab" className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm font-body bg-surface-card">
            <option value="tab">This tab: {purchaseGroupLabel(group)}</option>
            <option value="all">All categories</option>
          </select>
        </div>
        <div className="w-40">
          <label htmlFor="all-orders-from" className="form-label text-xs">From date</label>
          <input id="all-orders-from" name="date_from" type="date" className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm font-body bg-surface-card" />
        </div>
        <div className="w-40">
          <label htmlFor="all-orders-to" className="form-label text-xs">To date</label>
          <input id="all-orders-to" name="date_to" type="date" className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm font-body bg-surface-card" />
        </div>
        <Button type="submit" size="sm" variant="secondary" isLoading={busy}>Export orders (CSV)</Button>
      </form>
    </section>
  );
}
