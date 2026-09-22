'use client';

import { useEffect, useState } from 'react';
import PurchaseTabs from '@/components/admin/PurchaseTabs';
import { purchaseGroup, purchaseGroupLabel } from '@/lib/orders/purchase-groups';
import { formatCurrency } from '@/lib/utils';
import Button from '@/components/ui/Button';
import { parseApiResponse } from '@/lib/admin-client';
import { paymentLedgerFilename } from '@/lib/payments/ledger-export';

export default function AdminPaymentsPage() {
  const [group,setGroup]=useState('merch');
  const [ledger,setLedger]=useState<Array<{id:string;order_id:string;amount:number;method:string;status:string;payment_reference?:string;created_at:string}>>([]);
  const [orders,setOrders]=useState<Array<{id:string;order_category?:string;items?:Array<{name?:string}>;payment_reference?:string;customer_name:string}>>([]);
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

  useEffect(() => { loadAmbiguous(); Promise.all([fetch('/api/admin/orders/payments',{cache:'no-store'}).then(r=>parseApiResponse<{data:typeof ledger}>(r)),fetch('/api/admin/resources/orders',{cache:'no-store'}).then(r=>parseApiResponse<{data:typeof orders}>(r))]).then(([payments,rows])=>{setLedger(payments.data||[]);setOrders(rows.data||[]);}).catch(e=>setMessage(e.message)); }, []);

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
      const response = await fetch(`/api/admin/payments/export?group=${encodeURIComponent(group)}`, {
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
      <h1 className="text-2xl font-display font-bold">Payments</h1>
      <PurchaseTabs active={group} onSelect={setGroup} />
      <h2 className="text-xl font-semibold">{purchaseGroupLabel(group)} payments</h2>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Order reference','Customer','Amount','Method','Status','Date'].map(label=><th key={label} className="p-3 text-left">{label}</th>)}</tr></thead><tbody>{ledger.filter(p=>{const order=orders.find(o=>o.id===p.order_id);return order&&purchaseGroup(order)===group;}).map(p=>{const order=orders.find(o=>o.id===p.order_id);return <tr key={p.id} className="border-t border-edge-subtle"><td className="p-3">{order?.payment_reference||p.payment_reference}</td><td className="p-3">{order?.customer_name}</td><td className="p-3">{formatCurrency(p.amount)}</td><td className="p-3">{p.method}</td><td className="p-3">{p.status}</td><td className="p-3">{new Date(p.created_at).toLocaleDateString('en-AU',{timeZone:'Australia/Melbourne'})}</td></tr>;})}</tbody></table></div>
      <div className="flex gap-3">
        <Button onClick={reconcile}>Run Auto Reconciliation</Button>
        <Button
          type="button"
          variant="secondary"
          isLoading={exporting}
          onClick={exportPaymentLedger}
        >
          Export This Category CSV
        </Button>
      </div>
      {message && <p className="text-sm text-content-muted">{message}</p>}

      <h2 className="text-xl font-semibold">Unmatched bank transactions</h2><p className="text-sm text-content-muted">Transactions without a confirmed order remain here until matched.</p>
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
