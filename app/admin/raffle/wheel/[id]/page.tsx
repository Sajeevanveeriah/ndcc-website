'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import {
  WHEEL_RECORD_RETENTION_YEARS,
  formatAud,
  formatMelbourneDateTime,
  respinReasonLabel,
  wheelDrawState,
  wheelSalesState,
} from '@/lib/prize-wheel/rules';
import { postWheelAction, useWheelDetail } from '../useWheelDetail';

type Summary = { tickets: number; paidCents: number; prizeCostCents: number; netCents: number };
const newSaleKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '');

export default function WheelOperationsPage() {
  const id = String(useParams<{ id: string }>().id || '');
  const { detail, error, reload } = useWheelDetail(id);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState('');
  const [sale, setSale] = useState({ name: '', email: '', phone: '', numbers: [] as number[], adult: false, cash: false, key: '' });

  useEffect(() => {
    if (!detail) return;
    void fetch(`/api/admin/raffle/wheel/${encodeURIComponent(id)}/report`, { cache: 'no-store', credentials: 'include' })
      .then(response => response.ok ? response.json() : null).then(data => setSummary(data?.summary || null)).catch(() => undefined);
  }, [detail, id]);
  useEffect(() => { setSale(current => current.key ? current : { ...current, key: newSaleKey() }); }, []);

  if (error && !detail) return <p role="alert">{error}</p>;
  if (!detail) return <p role="status">Loading prize wheel...</p>;
  const { campaign } = detail;
  const state = wheelSalesState(campaign, new Date());
  const draws = wheelDrawState(detail.prizes, detail.draws);
  const soldNumbers = new Set(detail.tickets.map(ticket => ticket.ticket_number));
  const unavailable = new Set(detail.unavailable);
  const ticketById = new Map(detail.tickets.map(ticket => [ticket.id, ticket]));
  const collected = new Map(detail.collections.map(item => [item.draw_id, item]));
  const emailed = new Map(detail.emails.map(item => [item.draw_id, item]));
  const prizeById = new Map(detail.prizes.map(prize => [prize.id, prize]));

  async function run(label: string, action: () => Promise<string>) {
    setBusy(label); setActionError(''); setMessage('');
    try { setMessage(await action()); await reload(); }
    catch (failure) { setActionError(failure instanceof Error ? failure.message : 'The request failed.'); }
    finally { setBusy(''); }
  }

  async function recordCashSale(event: React.FormEvent) {
    event.preventDefault();
    await run('cash', async () => {
      const result = await postWheelAction<{ ticketReferences: string[]; amountCents: number }>(`/api/admin/raffle/wheel/${id}/cash`, {
        name: sale.name, email: sale.email, phone: sale.phone, selectedNumbers: sale.numbers, adultConfirmed: sale.adult,
        cashReceived: sale.cash, saleKey: sale.key, priceCents: campaign.price_cents,
      });
      setSale({ name: '', email: '', phone: '', numbers: [], adult: false, cash: false, key: newSaleKey() });
      return `Cash sale recorded: ${result.ticketReferences.join(', ')} (${formatAud(result.amountCents)}). Tickets and receipt are emailed to the buyer.`;
    });
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-3">
      <Link href="/admin/raffle" className="underline">Back to raffles</Link>
      <Link href={`/admin/raffle/wheel/${id}/draw`} className="btn-primary">Open live draw screen</Link>
      <a href={`/api/admin/raffle/wheel/${id}/report?format=csv`} className="btn-secondary">Download report (CSV)</a>
    </div>
    <div>
      <h1 className="text-2xl font-display font-bold">{campaign.name}</h1>
      <p className="text-content-muted">{campaign.code}. Draw {formatMelbourneDateTime(campaign.draw_at)} at {campaign.draw_label}. Sales from {formatMelbourneDateTime(campaign.sales_open_at)}. {campaign.wheel_divisions} numbers at {formatAud(campaign.price_cents)}.</p>
      <p className="text-sm text-content-muted">Keep the downloaded report and draw records for {WHEEL_RECORD_RETENTION_YEARS} years. Draw records cannot be edited or deleted.</p>
    </div>
    {message && <p role="status" className="text-green-700 dark:text-green-400">{message}</p>}
    {actionError && <p role="alert" className="text-red-700 dark:text-red-400">{actionError}</p>}

    {summary && <section className="grid gap-3 sm:grid-cols-4" aria-label="Sales summary">
      {[['Paid tickets', String(summary.tickets)], ['Ticket sales', formatAud(summary.paidCents)], ['Prize cost', formatAud(summary.prizeCostCents)], ['Net', formatAud(summary.netCents)]].map(([label, value]) =>
        <div key={label} className="rounded-lg border border-edge-subtle bg-surface-card p-4"><p className="text-sm text-content-muted">{label}</p><p className="text-xl font-bold">{value}</p></div>)}
    </section>}

    <section className="rounded-lg border border-edge-subtle bg-surface-card p-5 space-y-3" aria-labelledby="wheel-numbers">
      <h2 id="wheel-numbers" className="font-display text-xl font-bold">Numbers</h2>
      <p className="text-sm">Sold {soldNumbers.size} of {campaign.wheel_divisions}. Held by unfinished card checkouts: {[...unavailable].filter(n => !soldNumbers.has(n)).length}. Sales status: {state === 'open' ? 'open online and cash' : state === 'cash_only' ? 'cash only (online closed)' : state === 'upcoming' ? 'not open yet' : 'closed'}.</p>
      <form onSubmit={recordCashSale} className="space-y-3">
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
          {Array.from({ length: campaign.wheel_divisions }, (_, index) => index + 1).map(number => {
            const taken = unavailable.has(number);
            const picked = sale.numbers.includes(number);
            return <button key={number} type="button" aria-pressed={picked} aria-label={`Number ${number}${soldNumbers.has(number) ? ', sold' : taken ? ', held' : ''}`}
              disabled={(taken && !picked) || state === 'closed' || state === 'upcoming' || (!picked && sale.numbers.length >= 20)}
              onClick={() => setSale({ ...sale, numbers: picked ? sale.numbers.filter(n => n !== number) : [...sale.numbers, number] })}
              className={`min-h-11 rounded-md border text-sm font-bold ${picked ? 'bg-maroon-700 border-maroon-700 text-white' : soldNumbers.has(number) ? 'bg-surface-muted line-through' : taken ? 'bg-surface-muted italic' : 'border-edge-subtle bg-surface-card'} disabled:cursor-not-allowed`}>
              {number}
            </button>;
          })}
        </div>
        {(state === 'open' || state === 'cash_only') && <>
          <h3 className="font-bold">Record a cash sale</h3>
          <p className="text-sm">The buyer picks free numbers above. Selected: {sale.numbers.length ? [...sale.numbers].sort((a, b) => a - b).join(', ') : 'none'}. Total {formatAud(sale.numbers.length * campaign.price_cents)}.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input id="wheel-cash-name" label="Buyer name" value={sale.name} maxLength={120} onChange={e => setSale({ ...sale, name: e.target.value })} />
            <Input id="wheel-cash-email" label="Buyer email" type="email" value={sale.email} maxLength={254} onChange={e => setSale({ ...sale, email: e.target.value })} />
            <Input id="wheel-cash-phone" label="Phone (optional)" type="tel" value={sale.phone} maxLength={40} onChange={e => setSale({ ...sale, phone: e.target.value })} />
          </div>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 h-5 w-5" checked={sale.adult} onChange={e => setSale({ ...sale, adult: e.target.checked })} /> <span>The buyer is 18 or older.</span></label>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 h-5 w-5" checked={sale.cash} onChange={e => setSale({ ...sale, cash: e.target.checked })} /> <span>I have received the exact cash total.</span></label>
          <Button type="submit" isLoading={busy === 'cash'} disabled={!sale.numbers.length || !sale.adult || !sale.cash || !sale.key}>Record cash sale</Button>
        </>}
      </form>
    </section>

    <section className="rounded-lg border border-edge-subtle bg-surface-card p-5 space-y-3" aria-labelledby="wheel-winners">
      <h2 id="wheel-winners" className="font-display text-xl font-bold">Winners</h2>
      {draws.prizes.map(item => {
        const winner = item.status === 'won' && item.latest ? ticketById.get(item.latest.ticket_id as string) : null;
        const collection = item.latest ? collected.get(item.latest.id) : null;
        const email = item.latest ? emailed.get(item.latest.id) : null;
        return <div key={item.prize.id} className="border-b border-edge-subtle pb-3 last:border-0">
          <p className="font-semibold">Prize {item.prize.position}: {item.prize.name}</p>
          {!winner ? <p className="text-sm text-content-muted">{item.status === 'pending' ? 'Not drawn yet.' : 'Latest spin had no winner: re-spin on the draw screen.'}</p> : <>
            <p className="text-sm">Ticket {winner.ticket_number} ({winner.ticket_reference}) - {winner.order?.customer_name} ({winner.order?.customer_email})</p>
            <p className="text-sm">{collection ? `Collected ${formatMelbourneDateTime(collection.collected_at)}, recorded by ${collection.staff?.full_name || 'committee member'}${collection.note ? ` (${collection.note})` : ''}.` : 'Not collected yet.'} {email ? `Winner emailed ${formatMelbourneDateTime(email.sent_at)}.` : ''}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {!collection && <Button size="sm" isLoading={busy === `collect-${item.latest!.id}`} onClick={() => run(`collect-${item.latest!.id}`, async () => { await postWheelAction(`/api/admin/raffle/wheel/${id}/collect`, { drawId: item.latest!.id }); return 'Prize marked as collected.'; })}>Mark collected</Button>}
              <Button size="sm" variant="secondary" isLoading={busy === `email-${item.latest!.id}`} onClick={() => run(`email-${item.latest!.id}`, async () => { await postWheelAction(`/api/admin/raffle/wheel/${id}/email`, { drawId: item.latest!.id }); return 'Winner email sent.'; })}>{email ? 'Resend winner email' : 'Email winner'}</Button>
            </div>
          </>}
        </div>;
      })}
    </section>

    <section className="rounded-lg border border-edge-subtle bg-surface-card p-5" aria-labelledby="wheel-log">
      <h2 id="wheel-log" className="font-display text-xl font-bold mb-3">Draw log</h2>
      {detail.draws.length === 0 ? <p className="text-sm text-content-muted">No spins recorded yet.</p> : <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="text-left"><th className="p-2">#</th><th className="p-2">Time</th><th className="p-2">Prize</th><th className="p-2">Number</th><th className="p-2">Result</th><th className="p-2">Reason</th><th className="p-2">Operator</th></tr></thead>
        <tbody>{detail.draws.map(draw => <tr key={draw.id} className="border-t border-edge-subtle">
          <td className="p-2">{draw.draw_number}</td><td className="p-2">{formatMelbourneDateTime(draw.created_at)}</td>
          <td className="p-2">{prizeById.get(draw.prize_id)?.position}</td><td className="p-2 font-bold">{draw.winning_number}</td>
          <td className="p-2">{draw.ticket_id ? ticketById.get(draw.ticket_id)?.ticket_reference || 'Winning ticket' : 'No winner'}</td>
          <td className="p-2">{respinReasonLabel(draw.respin_reason)}</td><td className="p-2">{(draw.operator_id && detail.operators[draw.operator_id]) || ''}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </div>;
}
