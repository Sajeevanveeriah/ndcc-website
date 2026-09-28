import { createServerClient } from '@/lib/supabase-server';
import { enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { resolveSpinner, sendSpinOrderPassEmail, spinReply, UUID_PATTERN } from '@/lib/spin-wheel/server';

export const dynamic = 'force-dynamic';

/**
 * Payment state of the caller's own spin order. Re-syncs the spins from the
 * order's payment status (self-healing if the database trigger ever failed)
 * and sends a guest's spin link email once the order is paid.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await enforceRateLimit(`spin-order:${getClientIp(request)}`, 30, 60_000)) return spinReply({ success: false, error: 'Please wait a moment and try again.' }, 429);
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return spinReply({ success: false, error: 'Order not found.' }, 404);
  try {
    const db = createServerClient();
    const { data: link, error } = await db.from('spin_wheel_orders')
      .select('id,wheel_id,order_id,auth_user_id,pass_id,quantity,paid_at,order:orders(payment_status)').eq('order_id', id).maybeSingle();
    if (error) return spinReply({ success: false, error: 'The order could not be checked. Please retry.' }, 503);
    if (!link) return spinReply({ success: false, error: 'Order not found.' }, 404);
    const who = await resolveSpinner(request, db, link.wheel_id);
    const owns = who.spinner && ((who.spinner.kind === 'user' && who.spinner.userId === link.auth_user_id)
      || (who.spinner.kind === 'pass' && who.spinner.passId === link.pass_id));
    if (!owns) return spinReply({ success: false, error: 'Order not found.' }, 404);
    const order = (Array.isArray(link.order) ? link.order[0] : link.order) as { payment_status: string } | null;
    const paid = order?.payment_status === 'paid';
    const sync = await db.rpc('sync_spin_wheel_order_entitlements', { target_order: link.order_id });
    // Never report "spins added" unless the spins are actually recorded.
    if (sync.error) return spinReply({ success: false, error: 'Your payment is recorded but the spins could not be added yet. Please check again shortly.' }, 503);
    if (paid) {
      const { count, error: countError } = await db.from('spin_wheel_entitlements').select('id', { count: 'exact', head: true }).eq('spin_order_id', link.id);
      if (countError || (count || 0) < link.quantity) return spinReply({ success: false, error: 'Your payment is recorded but the spins could not be added yet. Please check again shortly.' }, 503);
    }
    if (paid && link.pass_id) await sendSpinOrderPassEmail(db, link.id).catch(() => false);
    return spinReply({ success: true, paid, quantity: link.quantity });
  } catch {
    return spinReply({ success: false, error: 'The order could not be checked. Please retry.' }, 503);
  }
}
