'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { parseApiResponse } from '@/lib/admin-client';
import { paymentLedgerFilename } from '@/lib/payments/ledger-export';

export default function AdminPaymentsPage() {
  const [transactions, setTransactions] = useState<Array<{ id: string; payer_name: string; transaction_reference: string; amount: number; transaction_date: string }>>([]);
  const [message, setMessage] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadAmbiguous = async () => {
    try {
      const res = await fetch('/api/admin/payments/ambiguous', { cache: 'no-store' });
      const data = await parseApiResponse<{ transactions?: Array<{ id: string; payer_name: string; transaction_reference: string; amount: number; transaction_date: string }> }>(res);
      setTransactions(data.transactions || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load ambiguous transactions.');
    }
  };

  useEffect(() => { loadAmbiguous(); }, []);

  const reconcile = async () => {
    const res = await fetch('/api/admin/payments/reconcile', {
      method: 'POST',
      headers: { 'X-NDCC-CSRF': '1' },
    });
    try {
      const data = await parseApiResponse<{ autoMatched: number; needsReview: number }>(res);
      setMessage(`Auto-matched: ${data.autoMatched}, needs review: ${data.needsReview}`);
      loadAmbiguous();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Reconciliation failed.');
    }
  };

  const exportPaymentLedger = async () => {
    setExporting(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/payments/export', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-NDCC-CSRF': '1' },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Export failed (${response.status}).`);
      }

      const csv = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1]
        || paymentLedgerFilename();
      const downloadUrl = URL.createObjectURL(csv);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      setMessage('Payment ledger export downloaded.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to export the payment ledger.');
    } finally {
      setExporting(false);
    }
  };

  const confirm = async (transactionId: string, orderId: string) => {
    const res = await fetch('/api/admin/payments/ambiguous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: transactionId, order_id: orderId }),
    });
    try {
      await parseApiResponse(res);
      setMessage('Transaction manually confirmed.');
      loadAmbiguous();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to confirm transaction.');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">Payment Reconciliation</h1>
      <div className="flex gap-3">
        <Button onClick={reconcile}>Run Auto Reconciliation</Button>
        <Button
          type="button"
          variant="secondary"
          isLoading={exporting}
          onClick={exportPaymentLedger}
        >
          Export Payment Ledger CSV
        </Button>
      </div>
      {message && <p className="text-sm text-content-muted">{message}</p>}

      <div className="bg-surface-card border rounded-xl divide-y">
        {transactions.length === 0 ? (
          <p className="p-4 text-content-muted">No ambiguous transactions.</p>
        ) : transactions.map((tx) => (
          <div key={tx.id} className="p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{tx.payer_name || 'Unknown payer'} · ${tx.amount}</p>
              <p className="text-sm text-content-muted">{tx.transaction_reference || '(no reference)'} · {new Date(tx.transaction_date).toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <input id={`order-${tx.id}`} className="border rounded px-2 py-1 text-sm" placeholder="Order ID" />
              <Button size="sm" onClick={() => {
                const input = document.getElementById(`order-${tx.id}`) as HTMLInputElement | null;
                if (input?.value) confirm(tx.id, input.value);
              }}>Confirm</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
