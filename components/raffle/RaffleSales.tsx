'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import { filterRaffleOrders, raffleDeliveryStatus, raffleOrdersCsv, raffleReportFilename, raffleSalesSummary, type RaffleReportOrder } from '@/lib/raffle-report';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

const aud = (cents: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100);

export default function RaffleSales({ campaign, refreshKey = 0 }: { campaign: { id: string; code: string; name: string } | null; refreshKey?: number }) {
  const [orders, setOrders] = useState<RaffleReportOrder[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [method, setMethod] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await parseApiResponse<{ orders: RaffleReportOrder[] }>(await adminFetch('/api/admin/raffle/orders'));
      setOrders(result.orders);
      setLoaded(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load raffle sales.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);
  useEffect(() => { setSearch(''); setStatus('all'); setMethod('all'); }, [campaign?.id]);
  const campaignOrders = orders.filter(order => order.campaign_id === campaign?.id);
  const filtered = filterRaffleOrders(orders, campaign?.id || '', search, status, method);
  const summary = raffleSalesSummary(campaignOrders);
  const exportCsv = () => {
    if (!campaign || loading || error) return;
    const url = URL.createObjectURL(new Blob([raffleOrdersCsv(filtered, campaign.name)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = raffleReportFilename(campaign.code);
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="space-y-4" aria-labelledby="raffle-sales-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="raffle-sales-title" className="text-xl font-bold">Sales and tickets</h2><Button variant="secondary" onClick={load} disabled={loading}>Refresh sales</Button></div>
    {error && <p role="alert" className="text-red-700 dark:text-red-300">{error} {loaded ? 'Previously loaded figures may be out of date.' : 'Sales figures are unavailable.'}</p>}
    <dl className="grid grid-cols-2 gap-4 rounded-lg border border-edge-subtle bg-surface-card p-4 lg:grid-cols-4">
      {(['Paid orders', 'Issued tickets', 'Paid sales (AUD)', 'Cash awaiting handover (AUD)'] as const).map((label, index) => <div key={label}><dt className="text-sm text-content-muted">{label}</dt><dd className="mt-1 text-xl font-bold">{loading ? 'Loading...' : !loaded ? 'Unavailable' : [summary.paidOrders, summary.tickets, aud(summary.paidCents), aud(summary.outstandingCashCents)][index]}</dd></div>)}
    </dl>
    <p className="text-sm text-content-muted">Totals cover the selected campaign’s currently paid orders. Refunded and disputed orders are excluded. Filters below affect the table and CSV export.</p>
    <div className="grid gap-3 md:grid-cols-3"><Input id="raffle-sales-search" label="Search purchaser, email, reference, ticket or collector" value={search} onChange={event => setSearch(event.target.value)} />
      <label className="block text-sm font-semibold">Payment status<select className="form-input mt-1 w-full" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{[...new Set(campaignOrders.map(order => order.status))].sort().map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="block text-sm font-semibold">Payment method<select className="form-input mt-1 w-full" value={method} onChange={event => setMethod(event.target.value)}><option value="all">All methods</option><option value="cash">Cash</option><option value="stripe">Card</option></select></label></div>
    <div className="flex flex-wrap items-center gap-3"><p role="status">{loading ? 'Loading sales...' : !loaded ? 'Sales unavailable' : `${filtered.length} of ${campaignOrders.length} orders shown`}</p><Button variant="secondary" disabled={loading || Boolean(error) || !campaign || !filtered.length} onClick={exportCsv}>Export shown sales (CSV)</Button><Button variant="ghost" onClick={() => { setSearch(''); setStatus('all'); setMethod('all'); }}>Clear filters</Button></div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Raffle orders for {campaign?.name || 'the selected campaign'}</caption><thead><tr>{['Purchaser', 'Tickets', 'Total (AUD)', 'Payment', 'Collector / handover', 'Email', 'Created (Melbourne)'].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead><tbody>
      {filtered.map(order => <tr key={order.id} className="border-t border-edge-subtle"><td className="p-3"><strong>{order.customer_name}</strong><br />{order.customer_email}<br /><span className="font-mono text-xs">{order.payment_reference}</span></td><td className="p-3">{order.quantity} requested<ul className="font-mono text-xs">{[...order.raffle_tickets].sort((a, b) => a.ticket_number - b.ticket_number).map(ticket => <li key={ticket.ticket_reference}>{ticket.ticket_reference}</li>)}</ul></td><td className="p-3">{aud(order.amount_cents)}</td><td className="p-3">{order.status}<br />{order.payment_method === 'cash' ? 'Cash' : 'Card'}</td><td className="p-3">{order.member?.full_name || order.staff?.full_name || '-'}<br />{order.payment_method === 'cash' ? order.cash_received_by_member ? order.cash_handed_in_at ? 'Handed to club' : 'Awaiting handover' : 'Received by club' : ''}</td><td className="p-3">{raffleDeliveryStatus(order)}</td><td className="p-3">{new Date(order.created_at).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })}</td></tr>)}
      {!loading && loaded && !filtered.length && <tr><td colSpan={7} className="p-5 text-center text-content-muted">{campaignOrders.length ? 'No orders match these filters.' : 'No orders recorded for this campaign.'}</td></tr>}
    </tbody></table></div>
  </section>;
}
