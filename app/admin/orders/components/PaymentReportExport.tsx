'use client';

import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import Button from '@/components/ui/Button';

export default function PaymentReportExport({
  exporting,
  setExporting,
  setMessage,
}: {
  exporting: boolean;
  setExporting: (value: boolean) => void;
  setMessage: (message: string) => void;
}) {
  return (
      <section className="mb-6 bg-surface-card rounded-xl border border-edge-subtle p-4 space-y-3">
        <h2 className="font-display font-bold text-content-primary">Export Merchandise Payment Report</h2>
        <p className="text-xs text-content-muted">
          Downloads a CSV with one row per order item (products, options, sizes, personalisation, prices, payments).
          Choose fully paid, part-paid or unpaid orders for payment tracking. Supplier exports remain fully paid only.
        </p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (exporting) return;
            const form = e.currentTarget;
            const fd = new FormData(form);
            const params = new URLSearchParams();
            for (const key of ['date_from', 'date_to', 'payment_status', 'processed', 'product'] as const) {
              const value = String(fd.get(key) || '').trim();
              if (value) params.set(key, value);
            }
            setExporting(true);
            setMessage('');
            try {
              const response = await adminFetch(`/api/admin/orders/export?${params}`);
              if (!response.ok) {
                await parseApiResponse(response);
                return;
              }
              const blob = await response.blob();
              const downloadUrl = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = downloadUrl;
              link.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'ndcc-merchandise-payments.csv';
              document.body.appendChild(link);
              link.click();
              link.remove();
              window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
              setMessage('Merchandise payment report downloaded.');
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Unable to export the payment report.');
            } finally {
              setExporting(false);
            }
          }}
        >
          <div className="w-40">
            <label htmlFor="export-date-from" className="form-label text-xs">From date</label>
            <input id="export-date-from" name="date_from" type="date" className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm font-body bg-surface-card" />
          </div>
          <div className="w-40">
            <label htmlFor="export-date-to" className="form-label text-xs">To date</label>
            <input id="export-date-to" name="date_to" type="date" className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm font-body bg-surface-card" />
          </div>
          <div className="w-44">
            <label htmlFor="export-payment-status" className="form-label text-xs">Payment status</label>
            <select id="export-payment-status" name="payment_status" defaultValue="paid" className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm font-body bg-surface-card">
              <option value="all">Any</option>
              <option value="paid">Fully paid</option>
              <option value="part_paid">Part paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="needs_review">Needs review</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
          <div className="w-40">
            <label htmlFor="export-processed" className="form-label text-xs">Processed</label>
            <select id="export-processed" name="processed" className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm font-body bg-surface-card">
              <option value="">Any</option>
              <option value="true">Processed</option>
              <option value="false">Unprocessed</option>
            </select>
          </div>
          <div className="w-44">
            <label htmlFor="export-product" className="form-label text-xs">Product (name/slug)</label>
            <input id="export-product" name="product" type="text" className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm font-body bg-surface-card" placeholder="e.g. hoody" />
          </div>
          <p className="text-sm">For payment tracking only. Use the Apparel page for supplier orders.</p>
          <Button type="submit" size="sm" variant="secondary" isLoading={exporting}>Export payment report (CSV)</Button>
        </form>
      </section>
  );
}
