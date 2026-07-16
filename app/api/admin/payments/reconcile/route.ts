import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';
import { scoreOrderMatch, type CandidateOrder, type ImportedTransaction } from '@/lib/payments/matching';

export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await requireSession(['admin']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();

  const [{ data: transactions, error: txFetchError }, { data: orders, error: orderFetchError }] = await Promise.all([
    supabase.from('imported_transactions').select('*').in('match_status', ['unmatched', 'needs_review']).order('transaction_date', { ascending: false }),
    supabase.from('orders').select('id, total_amount, payment_reference, customer_name, created_at').in('payment_status', ['pending_bank_transfer', 'pending', 'unpaid', 'part_paid']),
  ]);
  if (txFetchError || orderFetchError) {
    return NextResponse.json({ success: false, error: txFetchError?.message || orderFetchError?.message || 'Failed to load reconciliation data.' }, { status: 500 });
  }

  let autoMatched = 0;
  let needsReview = 0;

  for (const tx of (transactions || []) as ImportedTransaction[]) {
    const ranked = ((orders || []) as CandidateOrder[])
      .map((order) => ({ order, score: scoreOrderMatch(order, tx) }))
      .filter((entry) => entry.score >= 40)
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 1 || (ranked.length > 1 && ranked[0].score >= 120 && ranked[0].score - ranked[1].score >= 30)) {
      const best = ranked[0].order;
      // Confirmation metadata only — the money itself is recorded as an
      // order_payments ledger row below, and the ledger trigger derives
      // payment_status/amount_paid/balance_due.
      const { error: orderUpdateError } = await supabase.from('orders').update({
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
        bank_reference_used: tx.transaction_reference || null,
      }).eq('id', best.id);
      if (orderUpdateError) continue;

      const { error: txUpdateError } = await supabase.from('imported_transactions').update({
        match_status: 'matched',
        matched_order_id: best.id,
        updated_at: new Date().toISOString(),
      }).eq('id', tx.id);
      if (txUpdateError) {
        await supabase.from('orders').update({ confirmed_by: null, confirmed_at: null, bank_reference_used: null }).eq('id', best.id);
        continue;
      }

      const { error: confirmationError } = await supabase.from('bank_transfer_confirmations').insert({
        order_id: best.id,
        transaction_id: tx.id,
        confirmed_by: user.id,
        bank_reference_used: tx.transaction_reference || '',
        notes: 'Auto-matched by reconciliation job',
      });
      if (confirmationError) {
        await supabase.from('orders').update({ confirmed_by: null, confirmed_at: null, bank_reference_used: null }).eq('id', best.id);
        await supabase.from('imported_transactions').update({ match_status: 'needs_review', matched_order_id: null }).eq('id', tx.id);
        continue;
      }

      const { error: ledgerError } = await supabase.from('order_payments').insert({
        order_id: best.id,
        amount: tx.amount,
        method: 'bank_transfer',
        provider: 'bank_import',
        provider_reference: tx.transaction_reference || null,
        status: 'settled',
        received_at: tx.transaction_date || new Date().toISOString(),
        recorded_by: user.id,
        notes: 'Auto-matched by reconciliation job',
        metadata: { imported_transaction_id: tx.id },
      });
      if (ledgerError) {
        // Roll the match back so the transaction is retried once the ledger
        // accepts the row (e.g. migration not yet applied).
        await supabase.from('orders').update({ confirmed_by: null, confirmed_at: null, bank_reference_used: null }).eq('id', best.id);
        await supabase.from('imported_transactions').update({ match_status: 'needs_review', matched_order_id: null }).eq('id', tx.id);
        continue;
      }

      autoMatched += 1;
    } else if (ranked.length > 1) {
      const { error: needsReviewError } = await supabase.from('imported_transactions').update({ match_status: 'needs_review', updated_at: new Date().toISOString() }).eq('id', tx.id);
      if (!needsReviewError) needsReview += 1;
    }
  }

  return NextResponse.json({ success: true, autoMatched, needsReview });
}
