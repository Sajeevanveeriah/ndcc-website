import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';

export async function GET() {
  const user = await requireSession(['admin']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('imported_transactions')
    .select('id, payer_name, transaction_reference, amount, transaction_date, matched_order_id')
    .eq('match_status', 'needs_review')
    .order('transaction_date', { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, transactions: data || [] });
}

export async function POST(request: Request) {
  const user = await requireSession(['admin']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const { transaction_id, order_id, notes } = await request.json();
  if (!transaction_id || !order_id) return NextResponse.json({ success: false, error: 'transaction_id and order_id are required.' }, { status: 400 });

  const supabase = createServerClient();

  await supabase.from('orders').update({
    payment_status: 'paid',
    confirmed_by: user.id,
    confirmed_at: new Date().toISOString(),
    needs_review_reason: '',
  }).eq('id', order_id);

  await supabase.from('imported_transactions').update({
    match_status: 'matched',
    matched_order_id: order_id,
    updated_at: new Date().toISOString(),
  }).eq('id', transaction_id);

  await supabase.from('bank_transfer_confirmations').insert({
    order_id,
    transaction_id,
    confirmed_by: user.id,
    notes: notes || 'Confirmed from ambiguous queue',
  });

  return NextResponse.json({ success: true });
}
