'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import Button from '@/components/ui/Button';
type Transfer = { id: string; kind: string; reference: string; name: string; amount_cents: number; selected_at: string };
export default function BankTransfersPage() {
  const [rows, setRows] = useState<Transfer[]>([]);
  const [busy, setBusy] = useState(false); const [ready, setReady] = useState(false); const [error, setError] = useState('');
  const [bankReferences, setBankReferences] = useState<Record<string,string>>({});
  const money = (cents: number) => new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(cents/100);
  async function load() {
    setBusy(true); setError('');
    try { const data = await parseApiResponse<{rows:Transfer[]}>(await adminFetch('/api/admin/payments/bank-transfers')); setRows(data.rows); setReady(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load bank transfers.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function confirm(row: Transfer) {
    const bank_reference = bankReferences[row.id]?.trim();
    if (!bank_reference || bank_reference.length < 3) { setError('Enter the bank transaction reference before confirming receipt.'); return; }
    if (!window.confirm(`Confirm you checked the bank and received the full ${money(row.amount_cents)} for ${row.reference}? This issues the receipt and any raffle tickets.`)) return;
    setBusy(true); setError('');
    try {
      await parseApiResponse(await adminFetch('/api/admin/payments/bank-transfers', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({kind:row.kind,id:row.id,expected_cents:row.amount_cents,bank_reference,confirmed_received:true}) }));
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not confirm receipt.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-5"><h1 className="text-2xl font-bold">Bank transfers to reconcile</h1><p>These purchasers selected bank deposit. Check these references together against the bank statement. A selection alone is not proof of payment.</p><div className="flex flex-wrap gap-4"><Button onClick={load} disabled={busy}>Refresh</Button><a href="/api/admin/payments/bank-transfers?format=csv" className="underline">Export bank transfer list</a><Link href="/admin/orders" className="underline">All orders</Link></div>{error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}{busy && <p role="status">Loading...</p>}{ready && !busy && rows.length === 0 && <p>No bank transfers awaiting receipt confirmation.</p>}
    {rows.map(row => <article key={`${row.kind}-${row.id}`} className="rounded-lg border border-edge-strong p-4 space-y-3"><h2 className="font-bold break-all">{row.reference} - {money(row.amount_cents)}</h2><p>{row.name} - {row.kind === 'dino' ? 'Dino Coach' : row.kind === 'raffle' ? 'Raffle' : 'Order'}</p><p className="text-sm">Selected {new Date(row.selected_at).toLocaleString('en-AU',{timeZone:'Australia/Melbourne'})}</p>{row.kind === 'order' ? <Link className="underline" href={`/admin/orders?reference=${encodeURIComponent(row.reference)}`}>Open order to record funds received</Link> : <div className="space-y-2"><label className="block">Bank transaction reference<input className="form-input mt-1 w-full" value={bankReferences[row.id] || ''} maxLength={200} onChange={event=>setBankReferences({...bankReferences,[row.id]:event.target.value})}/></label><Button disabled={busy} onClick={()=>void confirm(row)}>Confirm full deposit received</Button></div>}</article>)}
  </div>;
}
