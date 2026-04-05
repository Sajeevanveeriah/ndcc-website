'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { parseApiResponse } from '@/lib/admin-client';

export default function AdminPaymentsPage() {
  const [transactions, setTransactions] = useState<Array<{ id: string; payer_name: string; transaction_reference: string; amount: number; transaction_date: string }>>([]);
  const [message, setMessage] = useState('');

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
    const res = await fetch('/api/admin/payments/reconcile', { method: 'POST' });
    try {
      const data = await parseApiResponse<{ autoMatched: number; needsReview: number }>(res);
      setMessage(`Auto-matched: ${data.autoMatched}, needs review: ${data.needsReview}`);
      loadAmbiguous();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Reconciliation failed.');
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
        <a href="/api/admin/payments/export"><Button variant="secondary">Export Xero CSV</Button></a>
      </div>
      {message && <p className="text-sm text-gray-600">{message}</p>}

      <div className="bg-white border rounded-xl divide-y">
        {transactions.length === 0 ? (
          <p className="p-4 text-gray-500">No ambiguous transactions.</p>
        ) : transactions.map((tx) => (
          <div key={tx.id} className="p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{tx.payer_name || 'Unknown payer'} · ${tx.amount}</p>
              <p className="text-sm text-gray-500">{tx.transaction_reference || '(no reference)'} · {new Date(tx.transaction_date).toLocaleDateString()}</p>
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
