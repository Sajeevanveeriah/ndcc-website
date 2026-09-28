import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { revalidatePublicContent } from '@/lib/server/revalidate-public';
import { scheduleAdminAudit } from '@/lib/revisions/server';
import { loadSpinWheelStats } from '@/lib/spin-wheel/admin';
import { loadSpinSegments, loadSpinWheel, spinReply, UUID_PATTERN } from '@/lib/spin-wheel/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionResult('raffle');
  if (!auth.user) return spinReply({ success: false, error: auth.error }, auth.status);
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return spinReply({ success: false, error: 'Wheel not found.' }, 404);
  try {
    const db = createServerClient();
    const [wheel, segments, stats] = await Promise.all([loadSpinWheel(db, id), loadSpinSegments(db, id), loadSpinWheelStats(db, id)]);
    if (!wheel) return spinReply({ success: false, error: 'Wheel not found.' }, 404);
    if (!segments || !stats) return spinReply({ success: false, error: 'The wheel could not be loaded.' }, 503);
    return spinReply({ success: true, wheel, segments, stats, serverTime: new Date().toISOString() });
  } catch {
    return spinReply({ success: false, error: 'The wheel could not be loaded.' }, 503);
  }
}

/** Delete a wheel that has never been spun or sold. Otherwise set it to ended. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionResult('raffle');
  if (!auth.user) return spinReply({ success: false, error: auth.error }, auth.status);
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return spinReply({ success: false, error: 'Wheel not found.' }, 404);
  try {
    const db = createServerClient();
    // Any spin, order, spin link or granted spin keeps the wheel: deleting
    // would cascade away spins already promised to people.
    const checks = await Promise.all(['spin_wheel_results', 'spin_wheel_orders', 'spin_wheel_passes', 'spin_wheel_entitlements']
      .map(table => db.from(table).select('id', { count: 'exact', head: true }).eq('wheel_id', id)));
    if (checks.some(check => check.error)) return spinReply({ success: false, error: 'The wheel could not be checked.' }, 503);
    if (checks.some(check => (check.count || 0) > 0)) {
      return spinReply({ success: false, error: 'This wheel has spins, orders, spin links or granted spins on record, so it cannot be deleted. Set its status to Ended instead.' }, 409);
    }
    const { error } = await db.from('spin_wheels').delete().eq('id', id);
    if (error) return spinReply({ success: false, error: 'The wheel could not be deleted.' }, 409);
    scheduleAdminAudit({ actor: auth.user, action: 'delete', resource: 'spin_wheels', recordId: id, summary: 'Deleted unused wheel' });
    revalidatePublicContent();
    return spinReply({ success: true });
  } catch {
    return spinReply({ success: false, error: 'The wheel could not be deleted.' }, 503);
  }
}
