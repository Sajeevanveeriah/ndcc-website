import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await requirePermission('payments', ['admin']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const { transactions } = await request.json();
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return NextResponse.json({ success: false, error: 'transactions array is required.' }, { status: 400 });
  }

  const rows = transactions.map((tx: { payer_name?: string; transaction_reference?: string; amount: number; transaction_date: string; raw_data?: unknown }) => ({
    payer_name: tx.payer_name || '',
    transaction_reference: tx.transaction_reference || '',
    amount: Number(tx.amount),
    transaction_date: tx.transaction_date,
    raw_data: tx.raw_data || {},
    source: 'manual_import',
    match_status: 'unmatched',
  }));

  const supabase = createServerClient();
  const { error } = await supabase.from('imported_transactions').insert(rows);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, imported: rows.length });
}
