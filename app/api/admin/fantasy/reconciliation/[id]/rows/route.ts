import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store', Vary: 'Cookie' } as const;
const statuses = ['approved', 'rejected', 'deferred'] as const;

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await requirePermission('fantasy.review');
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403, headers: noStore });
  const url = new URL(request.url);
  const classification = url.searchParams.get('classification');
  const supabase = createServerClient();
  let query = supabase.from('fantasy_historical_reconciliation_rows').select('*').eq('run_id', params.id).order('created_at');
  if (classification) query = query.eq('classification', classification);
  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: noStore });
  return NextResponse.json({ success: true, rows }, { headers: noStore });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await requirePermission('fantasy.review');
  if (!user) return NextResponse.json({ success: false, error: 'Admin sign in is required.' }, { status: 403, headers: noStore });
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || '');
  const supabase = createServerClient();

  if (action === 'bulk_approve_exact') {
    const { error } = await supabase.from('fantasy_historical_reconciliation_rows').update({ review_status: 'approved', reviewed_by: user.email, reviewed_at: new Date().toISOString() }).eq('run_id', params.id).eq('classification', 'exact_match').eq('review_status', 'pending');
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: noStore });
    await supabase.from('fantasy_historical_reconciliation_audit').insert({ run_id: params.id, action: 'bulk_exact_approved', actor: user.email, detail: { scope: 'exact_match_only' } });
    return NextResponse.json({ success: true }, { headers: noStore });
  }

  const rowId = String(body.rowId || '').trim();
  const status = String(body.status || '').trim() as typeof statuses[number];
  if (!rowId || !statuses.includes(status)) return NextResponse.json({ success: false, error: 'rowId and a supported status are required.' }, { status: 400, headers: noStore });
  const { data: row, error: rowError } = await supabase.from('fantasy_historical_reconciliation_rows').select('classification').eq('id', rowId).eq('run_id', params.id).maybeSingle();
  if (rowError) return NextResponse.json({ success: false, error: rowError.message }, { status: 500, headers: noStore });
  if (!row) return NextResponse.json({ success: false, error: 'Review row not found.' }, { status: 404, headers: noStore });
  if (status === 'approved' && row.classification !== 'exact_match') {
    return NextResponse.json({ success: false, error: 'Only deterministic exact matches can be approved in this bulk workflow. Defer ambiguous or conflicting rows for manual resolution.' }, { status: 400, headers: noStore });
  }
  const { error } = await supabase.from('fantasy_historical_reconciliation_rows').update({ review_status: status, reviewed_by: user.email, reviewed_at: new Date().toISOString() }).eq('id', rowId).eq('run_id', params.id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: noStore });
  await supabase.from('fantasy_historical_reconciliation_audit').insert({ run_id: params.id, row_id: rowId, action: status === 'approved' ? 'row_approved' : status === 'rejected' ? 'row_rejected' : 'row_deferred', actor: user.email, detail: { classification: row.classification } });
  return NextResponse.json({ success: true }, { headers: noStore });
}
