'use client';

import PurchaseTabs from '@/components/admin/PurchaseTabs';
import { purchaseGroup } from '@/lib/orders/purchase-groups';
import { mealCollectionLabel, mealServiceLabel } from '@/lib/meal-collection';
import { Fragment, useEffect, useRef, useState } from 'react';
import { formatDate, formatCurrency } from '@/lib/utils';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import type { Order } from '@/lib/types';
import Button from '@/components/ui/Button';
import DeleteRecordButton from '@/components/admin/DeleteRecordButton';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import { Select } from '@/components/ui/Input';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { ShoppingBag } from 'lucide-react';
import { MANUAL_PAYMENT_LIMITS, parseAudInputToCents } from '@/lib/payments/manual-payment';

type AdminOrder = Order & {
  deleted_at?: string | null;
  order_category?: string;
  meal_collection_window?: string | null;
  meal_service_date?: string | null;
  amount_paid?: number | null;
  balance_due?: number | null;
  payment_reference?: string | null;
  order_status?: string | null;
  needs_review_reason?: string | null;
  merch_window_label?: string | null;
};

type OrderPayment = {
  id: string;
  order_id: string;
  payment_reference?: string | null;
  client_operation_id?: string | null;
  amount: number;
  currency: string;
  method: string;
  provider: string | null;
  provider_reference: string | null;
  status: string;
  received_at: string | null;
  recorded_by: string | null;
  notes: string | null;
  reverses_payment_id: string | null;
  created_at: string;
};

type PaymentSettings = {
  id?: boolean;
  bank_transfer_enabled: boolean;
  card_checkout_enabled: boolean;
  partial_payments_enabled: boolean;
  minimum_partial_amount: number;
  required_deposit_percent: number | null;
};

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

function paymentBadge(status: string) {
  switch (status) {
    case 'paid': return <Badge variant="success">Paid</Badge>;
    case 'part_paid': return <Badge variant="info">Part paid</Badge>;
    case 'partially_refunded': return <Badge variant="info">Partially refunded</Badge>;
    case 'refunded': return <Badge variant="default">Refunded</Badge>;
    case 'needs_review': return <Badge variant="danger">Needs review</Badge>;
    case 'pending_bank_transfer':
    case 'pending':
    case 'unpaid':
    default:
      return <Badge variant="warning">Unpaid</Badge>;
  }
}

// Legacy orders (pre-ledger) may carry payment_status 'paid' without ledger
// rows; treat those as settled for the balance gate.
function balanceDue(order: AdminOrder): number {
  if (typeof order.balance_due === 'number') {
    return order.payment_status === 'paid' ? Math.max(0, order.balance_due) : order.balance_due;
  }
  return order.payment_status === 'paid' ? 0 : Number(order.total_amount || 0);
}

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
        fetch('/api/admin/resources/orders?deleted=include', { cache: 'no-store' }),
        fetch('/api/admin/orders/payments', { cache: 'no-store' }),
        fetch('/api/admin/resources/merchPaymentSettings', { cache: 'no-store' }),
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
      const response = await fetch('/api/admin/resources/orders', {
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
      const response = await fetch('/api/admin/orders/payments', {
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
      const response = await fetch('/api/admin/orders/payments', {
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
      const response = await fetch('/api/admin/resources/merchPaymentSettings', {
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
      {group === 'merch' && <p className="mb-4 text-sm">Full payment is required before apparel orders can be processed or included in the supplier export. Balance reminders cover unpaid and part-paid orders every three weeks from the order date. <a className="underline" href="/pay-balance" target="_blank" rel="noreferrer">Open balance payment page</a></p>}
      {message && <p className="mb-4 text-sm text-content-muted" role="status">{message}</p>}

      {group === 'merch' && <Button variant="secondary" size="sm" className="mb-4" onClick={async()=>{try{const result=await parseApiResponse<{sent:number;failed:number;cancelled:number}>(await adminFetch('/api/admin/orders/reminders',{method:'POST'}));setMessage(`Reminders sent: ${result.sent}. Failed: ${result.failed}. Cancelled: ${result.cancelled}.`);}catch(e){setMessage(e instanceof Error?e.message:'Could not send reminders.');}}}>Send due balance reminders</Button>}
      {settings && group === 'merch' && (
        <section className="mb-6 bg-surface-card rounded-xl border border-edge-subtle p-4 space-y-3">
          <h2 className="font-display font-bold text-content-primary">Payment configuration</h2>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.bank_transfer_enabled}
                onChange={(e) => setSettings({ ...settings, bank_transfer_enabled: e.target.checked })}
              />
              Bank transfer enabled
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.card_checkout_enabled}
                onChange={(e) => setSettings({ ...settings, card_checkout_enabled: e.target.checked })}
              />
              Stripe Checkout enabled (also requires server configuration)
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.partial_payments_enabled}
                onChange={(e) => setSettings({ ...settings, partial_payments_enabled: e.target.checked })}
              />
              Partial payments allowed
            </label>
            <div className="w-40">
              <Input
                id="min-partial"
                label="Minimum part payment ($)"
                type="number"
                value={String(settings.minimum_partial_amount ?? 10)}
                onChange={(e) => setSettings({ ...settings, minimum_partial_amount: Number(e.target.value) })}
              />
            </div>
            <Button size="sm" isLoading={savingSettings} onClick={() => handleSaveSettings(settings)}>
              Save settings
            </Button>
          </div>
        </section>
      )}

      {group === 'merch' && <section className="mb-6 bg-surface-card rounded-xl border border-edge-subtle p-4 space-y-3">
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
      </section>}

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
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Customer</TableHeader>
              <TableHeader>Items</TableHeader>
              <TableHeader>Total</TableHeader>
              <TableHeader>Paid / Balance</TableHeader>
              <TableHeader>Payment</TableHeader>
              <TableHeader>Processed</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredOrders.map((o) => {
              const balance = balanceDue(o);
              const paid = typeof o.amount_paid === 'number' ? o.amount_paid : (o.payment_status === 'paid' ? o.total_amount : 0);
              const orderPayments = payments.filter((p) => p.order_id === o.id);
              const isOpen = openOrderId === o.id;
              return (
              <Fragment key={o.id}>
              <TableRow>
                <TableCell>
                  <div>
                    <p className="font-medium text-content-primary">{o.customer_name}</p>
                    <a href={`mailto:${o.customer_email}`} className="text-xs text-maroon-700 dark:text-maroon-200 hover:underline">{o.customer_email}</a>
                    <p className="text-xs text-gray-400">{o.customer_phone}</p>
                    {o.order_category === 'kitchen' && <p className="text-sm"><strong>{mealCollectionLabel(o.meal_collection_window)}</strong><br />{mealServiceLabel(o.meal_service_date)} (Australia/Melbourne)</p>}
                    {o.payment_reference && <p className="text-xs font-mono text-content-muted">{o.payment_reference}</p>}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    {o.items.map((item, i) => (
                      <div key={i} className="text-xs">
                        <p>
                          {item.name} ({item.size}) x{item.quantity}
                          {item.applied_options?.map((opt) => ` · ${opt.label}`).join('')}
                        </p>
                        {item.custom_name && <p className="text-content-muted">Surname: {item.custom_name}</p>}
                        {item.custom_number !== undefined && (
                          <p className="text-content-muted">
                            Number preferences: {item.custom_number}
                            {item.alternate_number !== undefined ? `, ${item.alternate_number}` : ''} (subject to availability)
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="font-medium">{formatCurrency(o.total_amount)}</TableCell>
                <TableCell>
                  <p className="text-sm">{formatCurrency(paid)}</p>
                  <p className={`text-xs ${balance > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                    {balance > 0 ? `${formatCurrency(balance)} due` : 'No balance due'}
                  </p>
                </TableCell>
                <TableCell>
                  {paymentBadge(o.payment_status)}
                  {o.needs_review_reason ? (
                    <p className="mt-1 text-xs text-red-600 max-w-[180px]">{o.needs_review_reason}</p>
                  ) : null}
                </TableCell>
                <TableCell>
                  {o.processed ? <Badge variant="success">Yes</Badge> : <Badge variant="danger">No</Badge>}
                </TableCell>
                <TableCell>{formatDate(o.created_at)}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-2">
                    <label
                      className={`inline-flex items-center gap-1 text-xs ${balance > 0 ? 'opacity-50' : ''}`}
                      title={balance > 0 ? 'Disabled until the balance due is zero.' : 'Mark the physical order as processed (separate from payment).'}
                    >
                      <input
                        type="checkbox"
                        checked={o.processed}
                        disabled={balance > 0}
                        onChange={(e) => handleSetProcessed(o.id, e.target.checked)}
                      />
                      Order processed
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={isOpen}
                      onClick={() => {
                        setOpenOrderId(isOpen ? null : o.id);
                        paymentOperationRef.current = null;
                        setPaymentForm({ method: 'bank_transfer', amount: '', notes: '' });
                      }}
                    >
                      {isOpen ? 'Hide payments' : `Payments (${orderPayments.length})`}
                    </Button>
                    {o.deleted_at ? <Button size="sm" variant="secondary" onClick={() => restoreOrder(o.id)}>Restore order</Button> : <DeleteRecordButton
                      resource="orders"
                      recordId={o.id}
                      recordLabel={`order for ${o.customer_name}`}
                      recordDetails={[
                        { label: 'Customer', value: o.customer_name },
                        { label: 'Email', value: o.customer_email },
                        { label: 'Total', value: formatCurrency(o.total_amount) },
                        { label: 'Payment', value: o.payment_status },
                        { label: 'Processed', value: o.processed ? 'Yes' : 'No' },
                        { label: 'Date', value: formatDate(o.created_at) },
                      ]}
                      dangerLevel={o.payment_status === 'paid' || o.processed ? 'strong' : 'normal'}
                      requireTypedConfirmation
                      confirmationPhrase="DELETE ORDER"
                      strongWarning="Processed, stale and test orders can be removed from the working list. Restore them from Deleted orders. Payments are retained; deleting does not cancel or refund a payment."
                      onDeleted={handleDeleted}
                      onSuccessMessage={setMessage}
                    />}
                  </div>
                </TableCell>
              </TableRow>
              {isOpen && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <div className="space-y-4 py-2">
                      <div>
                        <h3 className="font-display font-bold text-sm text-content-primary mb-2">Payment history</h3>
                        {orderPayments.length === 0 ? (
                          <p className="text-xs text-content-muted">No payments recorded yet.</p>
                        ) : (
                          <ul className="space-y-1">
                            {orderPayments.map((p) => (
                              <li key={p.id} className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-mono">{formatDate(p.received_at || p.created_at)}</span>
                                <span className="font-semibold">{formatCurrency(p.amount)}</span>
                                <span>{p.method}</span>
                                {o.payment_reference && <span className="font-mono text-content-muted">Order / receipt: {o.payment_reference}</span>}
                                {p.payment_reference && <details className="text-content-muted"><summary className="cursor-pointer">Transaction details</summary><span className="font-mono">{p.payment_reference}</span></details>}
                                <Badge variant={p.status === 'settled' ? 'success' : p.status === 'refunded' ? 'default' : p.status === 'void' ? 'default' : 'warning'}>
                                  {p.status}
                                </Badge>
                                {p.provider_reference && <span className="font-mono text-content-muted">Provider: {p.provider_reference}</span>}
                                {p.recorded_by && <span className="text-content-muted">by {p.recorded_by}</span>}
                                {p.notes && <span className="text-content-muted">— {p.notes}</span>}
                                {p.status === 'settled' && p.provider !== 'stripe' && (
                                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleReversePayment(p)}>
                                    Reverse
                                  </Button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="w-44">
                          <Select
                            id={`method-${o.id}`}
                            label="Payment method"
                            options={PAYMENT_METHODS}
                            value={paymentForm.method}
                            onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value }))}
                          />
                        </div>
                        <div className="w-36">
                          <Input
                            id={`amount-${o.id}`}
                            label="Amount ($)"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={paymentForm.amount}
                            onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                          />
                        </div>
                        <div className="w-64">
                          <Input
                            id={`notes-${o.id}`}
                            label="Notes (optional)"
                            value={paymentForm.notes}
                            maxLength={MANUAL_PAYMENT_LIMITS.notesLength}
                            onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
                          />
                        </div>
                        <Button size="sm" isLoading={savingPayment} onClick={() => handleRecordPayment(o)}>
                          Record Payment
                        </Button>
                      </div>
                      <p className="text-xs text-content-muted">
                        Card payments are recorded automatically by the Stripe webhook. Corrections are reversing
                        entries — payment history is never edited or deleted.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
