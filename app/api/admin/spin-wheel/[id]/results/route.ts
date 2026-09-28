import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { scheduleAdminAudit } from '@/lib/revisions/server';
import { spinResultsCsv, type SpinAdminResult } from '@/lib/spin-wheel/admin';
import { spinReply, UUID_PATTERN } from '@/lib/spin-wheel/server';

export const dynamic = 'force-dynamic';

const RESULT_COLUMNS = 'id,reference,segment_position,segment_label,prize_name,is_prize,spinner_email,spinner_name,auth_user_id,pass_id,created_at,claimed_at,voided_at,void_reason,winner_emailed_at';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionResult('raffle');
  if (!auth.user) return spinReply({ success: false, error: auth.error }, auth.status);
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return spinReply({ success: false, error: 'Wheel not found.' }, 404);
  const url = new URL(request.url);
  try {
    let query = createServerClient().from('spin_wheel_results').select(RESULT_COLUMNS).eq('wheel_id', id);
    if (url.searchParams.get('winners') === '1') query = query.eq('is_prize', true);
    if (url.searchParams.get('unclaimed') === '1') query = query.eq('is_prize', true).is('claimed_at', null).is('voided_at', null);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (from && !Number.isNaN(new Date(from).getTime())) query = query.gte('created_at', new Date(from).toISOString());
    if (to && !Number.isNaN(new Date(to).getTime())) query = query.lt('created_at', new Date(to).toISOString());
    const { data, error } = await query.order('created_at', { ascending: false }).limit(5000);
    if (error) return spinReply({ success: false, error: 'Results could not be loaded.' }, 503);
    const rows = (data || []) as SpinAdminResult[];
    if (url.searchParams.get('format') === 'csv') {
      return new Response(spinResultsCsv(rows), { headers: {
        'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="spin-wheel-results-${id.slice(0, 8)}.csv"`,
      } });
    }
    return spinReply({ success: true, results: rows });
  } catch {
    return spinReply({ success: false, error: 'Results could not be loaded.' }, 503);
  }
}

/** Mark a prize claimed or unclaimed, or void a result with a reason. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionResult('raffle');
  if (!auth.user) return spinReply({ success: false, error: auth.error }, auth.status);
  const { id } = await params;
  const body = await readLimitedJsonObject(request, 2048);
  if (!body.ok) return spinReply({ success: false, error: body.error }, 400);
  const resultId = body.value.resultId;
  const action = body.value.action;
  const reason = typeof body.value.reason === 'string' ? body.value.reason.trim().slice(0, 500) : '';
  if (!UUID_PATTERN.test(id) || typeof resultId !== 'string' || !UUID_PATTERN.test(resultId) || !['claim', 'unclaim', 'void'].includes(action as string)) {
    return spinReply({ success: false, error: 'Choose a result and an action.' }, 400);
  }
  if (action === 'void' && !reason) return spinReply({ success: false, error: 'Enter a reason for voiding this result.' }, 400);
  const now = new Date().toISOString();
  const update = action === 'claim' ? { claimed_at: now, claimed_by: auth.user.id }
    : action === 'unclaim' ? { claimed_at: null, claimed_by: null }
      : { voided_at: now, voided_by: auth.user.id, void_reason: reason };
  try {
    let query = createServerClient().from('spin_wheel_results').update(update).eq('id', resultId).eq('wheel_id', id).is('voided_at', null);
    if (action === 'claim') query = query.eq('is_prize', true);
    const { data, error } = await query.select('id');
    if (error) return spinReply({ success: false, error: 'The result could not be updated.' }, 503);
    if (!data?.length) return spinReply({ success: false, error: 'That result cannot be changed (it may be voided or not a prize).' }, 409);
    scheduleAdminAudit({ actor: auth.user, action: String(action), resource: 'spin_wheel_results', recordId: resultId, summary: reason || null });
    return spinReply({ success: true });
  } catch {
    return spinReply({ success: false, error: 'The result could not be updated.' }, 503);
  }
}
