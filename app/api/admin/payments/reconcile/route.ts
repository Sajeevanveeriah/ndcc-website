import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';
import { scoreOrderMatch, type CandidateOrder, type ImportedTransaction } from '@/lib/payments/matching';

export async function POST() {
  const user = await requireSession(['admin']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();

  const [{ data: transactions }, { data: orders }] = await Promise.all([
    supabase.from('imported_transactions').select('*').in('match_status', ['unmatched', 'needs_review']).order('transaction_date', { ascending: false }),
    supabase.from('orders').select('id, total_amount, payment_reference, customer_name, created_at').eq('payment_status', 'pending_bank_transfer'),
  ]);

  let autoMatched = 0;
  let needsReview = 0;

  for (const tx of (transactions || []) as ImportedTransaction[]) {
    const ranked = ((orders || []) as CandidateOrder[])
      .map((order) => ({ order, score: scoreOrderMatch(order, tx) }))
      .filter((entry) => entry.score >= 40)
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 1 || (ranked.length > 1 && ranked[0].score >= 120 && ranked[0].score - ranked[1].score >= 30)) {
      const best = ranked[0].order;
      await supabase.from('orders').update({
        payment_status: 'paid',
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
        bank_reference_used: tx.transaction_reference || null,
        needs_review_reason: '',
      }).eq('id', best.id);

      await supabase.from('imported_transactions').update({
        match_status: 'matched',
        matched_order_id: best.id,
        updated_at: new Date().toISOString(),
      }).eq('id', tx.id);

      await supabase.from('bank_transfer_confirmations').insert({
        order_id: best.id,
        transaction_id: tx.id,
        confirmed_by: user.id,
        bank_reference_used: tx.transaction_reference || '',
        notes: 'Auto-matched by reconciliation job',
      });

      autoMatched += 1;
    } else if (ranked.length > 1) {
      await supabase.from('imported_transactions').update({ match_status: 'needs_review', updated_at: new Date().toISOString() }).eq('id', tx.id);
      needsReview += 1;
    }
  }

  return NextResponse.json({ success: true, autoMatched, needsReview });
}
