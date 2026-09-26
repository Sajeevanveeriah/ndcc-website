import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { fetchAllPages } from '@/lib/supabase-paginate';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { isUuidV1ToV5 } from '@/lib/validation/uuid';
import { toCsv } from '@/lib/csv';
import { bankHoldExpired } from '@/lib/payments/bank-transfer';
import { attemptPaymentReceiptDelivery, enqueuePaymentReceiptJob } from '@/lib/payments/receipt-delivery';
export const dynamic = 'force-dynamic';
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const NUMBERS_RESOLD_MESSAGE = 'Hold expired: the 48 hour hold on this bank deposit ended and one or more of its raffle numbers have since been sold or are held by another checkout. No tickets were issued. Cancel this reservation and contact the purchaser about their deposit.';
export async function GET(request: Request) {
  const admin = await requirePermission('orders', ['admin']);
  if (!admin || admin.role !== 'admin') return reply({ error: 'Administrator access required.' }, 403);
  try {
    const db = createServerClient();
    const rows: Array<{ id: string; kind: string; reference: string; name: string; amount_cents: number; selected_at: string; hold_expired: boolean }> = [];
    for (const kind of ['order', 'raffle', 'dino']) {
      const table = kind === 'order' ? 'orders' : kind === 'raffle' ? 'raffle_orders' : 'fantasy_entries';
      const fields = kind === 'order' ? 'id,payment_reference,customer_name,balance_due,bank_transfer_selected_at' : kind === 'raffle' ? 'id,payment_reference,customer_name,amount_cents,bank_transfer_selected_at,selected_ticket_numbers' : 'id,payment_reference,entry_fee_cents,bank_transfer_selected_at,fantasy_managers(display_name)';
      const result = await fetchAllPages((from, to) => {
        let query = db.from(table).select(fields).not('bank_transfer_selected_at', 'is', null);
        if (kind === 'order') query = query.is('deleted_at', null).neq('order_status', 'cancelled').in('payment_status', ['unpaid','pending','pending_bank_transfer','part_paid']).gt('balance_due', 0);
        else if (kind === 'raffle') query = query.eq('status', 'pending_payment').eq('payment_method', 'bank_transfer');
        else query = query.in('status', ['payment_required','pending','failed','expired']).eq('is_demo', false).eq('fee_waived', false);
        return query.order('bank_transfer_selected_at').order('id').range(from, to);
      });
      if (result.error) return reply({ error: 'Bank transfer list could not be loaded.' }, 503);
      for (const value of result.data || []) {
        const row = value as unknown as Record<string, unknown>;
        const manager = Array.isArray(row.fantasy_managers) ? row.fantasy_managers[0] : row.fantasy_managers;
        // Only reverse raffle orders reserve chosen numbers, so only they expire.
        const holdsNumbers = kind === 'raffle' && Array.isArray(row.selected_ticket_numbers) && row.selected_ticket_numbers.length > 0;
        rows.push({ id: String(row.id), kind, reference: String(row.payment_reference || ''), name: String(row.customer_name || (manager as {display_name?:string} | null)?.display_name || ''), amount_cents: kind === 'order' ? Math.round(Number(row.balance_due)*100) : Number(kind === 'raffle' ? row.amount_cents : row.entry_fee_cents), selected_at: String(row.bank_transfer_selected_at), hold_expired: holdsNumbers && bankHoldExpired(String(row.bank_transfer_selected_at)) });
      }
    }
    rows.sort((a,b) => a.selected_at.localeCompare(b.selected_at));
    if (new URL(request.url).searchParams.get('format') === 'csv') return new NextResponse(toCsv([
      ['Payment type','Reference','Purchaser','Awaiting AUD','Bank transfer selected at','Status'],
      ...rows.map(row => [row.kind,row.reference,row.name,(row.amount_cents/100).toFixed(2),row.selected_at,row.hold_expired ? 'Hold expired - numbers released for sale; receipt not confirmed' : 'Purchaser selection only - receipt not confirmed']),
    ]), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="NDCC-Bank-Transfers-To-Reconcile.csv"', 'Cache-Control': 'private, no-store' } });
    return reply({ rows });
  } catch { return reply({ error: 'Bank transfer list could not be loaded.' }, 503); }
}
export async function POST(request: Request) {
  const admin = await requirePermission('orders', ['admin']);
  if (!admin || admin.role !== 'admin') return reply({ error: 'Administrator access required.' }, 403);
  const parsed = await readLimitedJsonObject(request, 4096);
  if (!parsed.ok) return reply({ error: 'Invalid request.' }, 400);
  if (parsed.value.action === 'cancel') {
    const { id, kind, confirmed_cancelled } = parsed.value;
    if (kind !== 'raffle' || typeof id !== 'string' || !isUuidV1ToV5(id) || confirmed_cancelled !== true) return reply({ error: 'Confirm cancellation of this unpaid raffle reservation.' }, 400);
    try {
      // The conditional update serialises with receipt confirmation's row lock.
      // A completed payment can never be cancelled by this reservation action.
      const result = await createServerClient({ actorId: admin.id }).from('raffle_orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id).eq('payment_method', 'bank_transfer').eq('status', 'pending_payment')
        .is('bank_transfer_confirmed_at', null).is('stripe_checkout_session_id', null).is('stripe_payment_intent_id', null)
        .select('id').maybeSingle();
      if (result.error) return reply({ error: 'Reservation could not be released. Please retry.' }, 503);
      if (!result.data) return reply({ error: 'Reservation changed or is already paid/cancelled. Refresh the list.' }, 409);
      return reply({ success: true });
    } catch { return reply({ error: 'Reservation could not be released. Please retry.' }, 503); }
  }
  if (parsed.value.action === 'switch_to_card') {
    const { id, kind, confirmed_switch } = parsed.value;
    if (kind !== 'dino' || typeof id !== 'string' || !isUuidV1ToV5(id) || confirmed_switch !== true) return reply({ error: 'Confirm switching this unpaid Dino Coach entry back to card payment.' }, 400);
    try {
      const db = createServerClient({ actorId: admin.id });
      // The RPC locks the entry, rejects confirmed or paid entries and records
      // the change in fantasy_admin_events in the same transaction.
      const result = await db.rpc('switch_dino_bank_transfer_to_card', { target_entry_id: id, actor_id: admin.id });
      if (result.error && ['PGRST202', '42883'].includes(String((result.error as { code?: string }).code))) {
        // Before the migration is applied: the same guards as a conditional update.
        const updated = await db.from('fantasy_entries').update({ bank_transfer_selected_at: null, bank_transfer_reference: null })
          .eq('id', id).not('bank_transfer_selected_at', 'is', null).is('bank_transfer_confirmed_at', null)
          .in('status', ['payment_required','pending','failed','expired']).is('stripe_payment_intent_id', null)
          .select('id,manager_id,payment_reference').maybeSingle();
        if (updated.error) return reply({ error: 'Payment method could not be changed. Please retry.' }, 503);
        if (!updated.data) return reply({ error: 'This entry is confirmed, paid or no longer awaiting a bank deposit. Refresh the list.' }, 409);
        const entry = updated.data as { manager_id?: string; payment_reference?: string };
        const audit = await db.from('fantasy_admin_events').insert({ manager_id: entry.manager_id, actor_id: admin.id, action: 'bank_transfer_switched_to_card', reason: 'Administrator switched an unconfirmed bank deposit selection back to card payment', changes: { entry_id: id, payment_reference: entry.payment_reference || null } });
        if (audit.error) console.error('Dino payment switch audit failed:', audit.error.message);
        return reply({ success: true });
      }
      if (result.error) return reply({ error: 'Payment method could not be changed. Refresh and check the entry.' }, 409);
      if (result.data !== true) return reply({ error: 'This entry is confirmed, paid or no longer awaiting a bank deposit. Refresh the list.' }, 409);
      return reply({ success: true });
    } catch { return reply({ error: 'Payment method could not be changed. Please retry.' }, 503); }
  }
  const { kind, id, expected_cents, bank_reference, confirmed_received } = parsed.value;
  if (!['raffle','dino'].includes(String(kind)) || typeof id !== 'string' || !isUuidV1ToV5(id) || !Number.isSafeInteger(expected_cents) || Number(expected_cents) <= 0 || typeof bank_reference !== 'string' || bank_reference.trim().length < 3 || bank_reference.trim().length > 200 || confirmed_received !== true) return reply({ error: 'Confirm the full amount received and enter the bank transaction reference.' }, 400);
  try {
    const db = createServerClient();
    const result = await db.rpc('confirm_special_bank_transfer', { target_kind: kind, target_id: id, actor_id: admin.id, expected_cents, bank_reference: bank_reference.trim() });
    if (result.error) {
      if (String(result.error.message || '').includes('Reverse raffle numbers no longer available')) return reply({ error: NUMBERS_RESOLD_MESSAGE, numbers_unavailable: true }, 409);
      return reply({ error: 'Receipt could not be confirmed. Refresh and check the amount and payment state.' }, 409);
    }
    // The paid-state trigger queues the receipt atomically. Deliver it now,
    // best-effort; the scheduled outbox worker remains the fallback.
    let receiptDelivery = 'queued';
    try {
      const queued = await enqueuePaymentReceiptJob(db, kind === 'raffle' ? 'raffle_order' : 'dino_entry', id);
      if (queued.ok) receiptDelivery = (await attemptPaymentReceiptDelivery(db, queued.jobId)).status;
    } catch (deliveryError) {
      console.error('Immediate bank receipt delivery failed; the scheduled worker will retry:', deliveryError);
    }
    return reply({ success: true, newly_confirmed: result.data === true, receipt_delivery: receiptDelivery });
  } catch { return reply({ error: 'Receipt confirmation is temporarily unavailable.' }, 503); }
}
