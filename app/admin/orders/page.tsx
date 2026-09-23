'use client';

import PurchaseTabs from '@/components/admin/PurchaseTabs';
import { purchaseGroup } from '@/lib/orders/purchase-groups';
import { useEffect, useRef, useState } from 'react';
import { formatDate, formatCurrency } from '@/lib/utils';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import Button from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { ShoppingBag } from 'lucide-react';
import { parseAudInputToCents } from '@/lib/payments/manual-payment';
import OrdersTable from './components/OrdersTable';
import PaymentReportExport from './components/PaymentReportExport';
import PaymentSettingsPanel from './components/PaymentSettingsPanel';
import {
  PAYMENT_METHODS,
  balanceDue,
  type AdminOrder,
  type OrderPayment,
  type PaymentSettings,
} from './components/shared';


export default function AdminOrdersPage() {
  const [group, setGroup] = useState('merch');
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [payments, setPayments] = useState<OrderPayment[]>([]);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [message, setMessage] = useState('');
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({ method: 'bank_transfer', amount: '', notes: '' });
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [exporting, setExporting] = useState(false);
  const paymentOperationRef = useRef<{ signature: string; id: string } | null>(null);

  const fetchAll = async () => {
    try {
      const [ordersRes, paymentsRes, settingsRes] = await Promise.all([
        adminFetch('/api/admin/resources/orders?deleted=include', { cache: 'no-store' }),
        adminFetch('/api/admin/orders/payments', { cache: 'no-store' }),
        adminFetch('/api/admin/resources/merchPaymentSettings', { cache: 'no-store' }),
      ]);
      const ordersData = await parseApiResponse<{ data?: AdminOrder[] }>(ordersRes);
      setOrders(ordersData.data || []);
      // Ledger + settings degrade quietly until the payment migration lands.
      try {
        const paymentsData = await parseApiResponse<{ data?: OrderPayment[] }>(paymentsRes);
        setPayments(paymentsData.data || []);
      } catch { setPayments([]); }
      try {
        const settingsData = await parseApiResponse<{ data?: PaymentSettings[] }>(settingsRes);
        setSettings(settingsData.data?.[0] || null);
      } catch { setSettings(null); }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to fetch orders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setGroup(new URLSearchParams(window.location.search).get('group') || 'merch'); fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetProcessed = async (id: string, processed: boolean) => {
    try {
      const response = await adminFetch('/api/admin/resources/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, processed }),
      });
      await parseApiResponse(response);
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, processed } : o)));
      setMessage('Order updated.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update order.');
    }
  };

  const handleRecordPayment = async (order: AdminOrder) => {
    const amountCents = parseAudInputToCents(paymentForm.amount);
    if (amountCents === null) {
      setMessage('Enter a positive AUD amount with no more than two decimal places.');
      return;
    }
    const amount = amountCents / 100;
    const methodLabel = PAYMENT_METHODS.find((m) => m.value === paymentForm.method)?.label || paymentForm.method;
    const confirmed = window.confirm(
      `Record a ${methodLabel} payment of ${formatCurrency(amount)} against order ${order.payment_reference || order.id} `
      + `for ${order.customer_name}?\n\nBalance due before this payment: ${formatCurrency(balanceDue(order))}.`
    );
    if (!confirmed) return;

    const operationSignature = JSON.stringify({
      orderId: order.id,
      amountCents,
      method: paymentForm.method,
      notes: paymentForm.notes.trim(),
    });
    const operationId = paymentOperationRef.current?.signature === operationSignature
      ? paymentOperationRef.current.id
      : crypto.randomUUID();
    paymentOperationRef.current = { signature: operationSignature, id: operationId };
    setSavingPayment(true);
    try {
      const response = await adminFetch('/api/admin/orders/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: order.id,
          amount_cents: amountCents,
          method: paymentForm.method,
          notes: paymentForm.notes.trim(),
          client_operation_id: operationId,
        }),
      });
      const result = await parseApiResponse<{
        data?: OrderPayment;
        order?: Partial<AdminOrder> | null;
        replayed?: boolean;
      }>(response);
      if (result.data) {
        setPayments((prev) => [
          result.data as OrderPayment,
          ...prev.filter((payment) => payment.id !== result.data?.id),
        ]);
      }
      if (result.order) {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...result.order } : o)));
      }
      paymentOperationRef.current = null;
      setPaymentForm({ method: 'bank_transfer', amount: '', notes: '' });
      setMessage(result.replayed ? 'Payment was already recorded; the existing record was reused.' : 'Payment recorded.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to record payment.');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleReversePayment = async (payment: OrderPayment) => {
    const confirmed = window.confirm(
      `Reverse the ${formatCurrency(payment.amount)} ${payment.method} payment recorded on `
      + `${formatDate(payment.created_at)}?\n\nThis records a correcting reversal — history is preserved.`
    );
    if (!confirmed) return;
    try {
      const response = await adminFetch('/api/admin/orders/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reverses_payment_id: payment.id }),
      });
      await parseApiResponse(response);
      setMessage('Payment reversed.');
      fetchAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to reverse payment.');
    }
  };

  const handleSaveSettings = async (next: PaymentSettings) => {
    setSavingSettings(true);
    try {
      const response = await adminFetch('/api/admin/resources/merchPaymentSettings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: true,
          bank_transfer_enabled: next.bank_transfer_enabled,
          card_checkout_enabled: next.card_checkout_enabled,
          partial_payments_enabled: next.partial_payments_enabled,
          minimum_partial_amount: Number(next.minimum_partial_amount) || 10,
          required_deposit_percent: next.required_deposit_percent,
        }),
      });
      await parseApiResponse(response);
      setSettings(next);
      setMessage('Payment settings saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save payment settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDeleted = (id: string) => {
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, deleted_at: new Date().toISOString() } : o));
  };

  const restoreOrder = async (id: string) => {
    try { await parseApiResponse(await adminFetch('/api/admin/resources/orders', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,restore:true})})); await fetchAll(); setMessage('Order restored.'); } catch (error) {setMessage(error instanceof Error ? error.message : 'Restore failed.');}
  };
  const filteredOrders = orders.filter((o) => {
    if (purchaseGroup(o) !== group) return false;
    if (filterStatus === 'deleted') return Boolean(o.deleted_at);
    if (o.deleted_at) return false;
    if (filterStatus === 'processed' && !o.processed) return false;
    if (filterStatus === 'pending' && o.processed) return false;
    if (filterStatus === 'paid' && o.payment_status !== 'paid') return false;
    if (filterStatus === 'unpaid' && (o.payment_status === 'paid' || o.payment_status === 'refunded')) return false;
    if (filterStatus === 'part_paid' && o.payment_status !== 'part_paid' && o.payment_status !== 'partially_refunded') return false;
    if (filterStatus === 'needs_review' && o.payment_status !== 'needs_review') return false;
    return true;
  });

  const statusOptions = [
    { value: 'deleted', label: 'Deleted orders' },
    { value: 'pending', label: 'Unprocessed' },
    { value: 'processed', label: 'Processed' },
    { value: 'paid', label: 'Paid' },
    { value: 'part_paid', label: 'Part paid' },
    { value: 'unpaid', label: 'Unpaid' },
    { value: 'needs_review', label: 'Needs review' },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-content-primary flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-maroon-700 dark:text-maroon-200" />
            Orders
          </h1>
          <p className="text-content-muted font-body mt-1">
            {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <PurchaseTabs active={group} onSelect={value=>{setGroup(value);setOpenOrderId(null);window.history.replaceState(null,'',`?group=${encodeURIComponent(value)}`);}} />
      {group === 'kitchen' && <a className="block mb-4 underline" href="/admin/kitchen">Kitchen collection windows and meal exports</a>}
      {group === 'merch' && <p className="mb-4 text-sm">Full payment is required before apparel orders can be processed or included in the supplier export. Balance reminders cover unpaid and part-paid orders. The first reminder is due three weeks after ordering; subsequent reminders are due three weeks after the previous email. <a className="underline" href="/pay-balance" target="_blank" rel="noreferrer">Open balance payment page</a></p>}
      {message && <p className="mb-4 text-sm text-content-muted" role="status">{message}</p>}

      {group === 'merch' && <Button variant="secondary" size="sm" className="mb-4" onClick={async()=>{try{const result=await parseApiResponse<{sent:number;failed:number;cancelled:number}>(await adminFetch('/api/admin/orders/reminders',{method:'POST'}));setMessage(`Reminders sent: ${result.sent}. Failed: ${result.failed}. Cancelled: ${result.cancelled}.`);}catch(e){setMessage(e instanceof Error?e.message:'Could not send reminders.');}}}>Send due balance reminders</Button>}
      {settings && group === 'merch' && (
        <PaymentSettingsPanel
          settings={settings}
          setSettings={setSettings}
          savingSettings={savingSettings}
          onSave={handleSaveSettings}
        />
      )}

      {group === 'merch' && <PaymentReportExport exporting={exporting} setExporting={setExporting} setMessage={setMessage} />}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="w-full sm:w-48">
          <Select
            id="filter-status"
            options={statusOptions}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            label="Filter by Status"
          />
        </div>
        {filterStatus && (
          <div className="flex items-end">
            <Button variant="ghost" size="sm" onClick={() => setFilterStatus('')}>
              Clear Filters
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-surface-card rounded-xl border border-edge-subtle p-8 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-surface-card rounded-xl border border-edge-subtle p-8 text-center">
          <ShoppingBag className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-content-muted font-body">No orders found.</p>
        </div>
      ) : (
        <OrdersTable
          filteredOrders={filteredOrders}
          payments={payments}
          openOrderId={openOrderId}
          setOpenOrderId={setOpenOrderId}
          paymentOperationRef={paymentOperationRef}
          paymentForm={paymentForm}
          setPaymentForm={setPaymentForm}
          savingPayment={savingPayment}
          onSetProcessed={handleSetProcessed}
          onRecordPayment={handleRecordPayment}
          onReversePayment={handleReversePayment}
          onRestoreOrder={restoreOrder}
          onDeleted={handleDeleted}
          setMessage={setMessage}
        />
      )}
    </div>
  );
}
