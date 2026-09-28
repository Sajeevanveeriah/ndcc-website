import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { revalidatePublicContent } from '@/lib/server/revalidate-public';
import { scheduleAdminAudit } from '@/lib/revisions/server';
import { closesSpinWheel, normaliseSpinWheelInput, SPIN_CHECKOUT_CLOSE_MINUTES, validateSpinWheel } from '@/lib/spin-wheel/rules';
import { saveSpinWheelPayload, spinAdminDatabaseMessage } from '@/lib/spin-wheel/admin';
import { spinReply, UUID_PATTERN } from '@/lib/spin-wheel/server';
import { loadSpinWheel } from '@/lib/spin-wheel/server';
import { SPIN_WHEEL_COLUMNS } from '@/lib/spin-wheel/visibility';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requirePermissionResult('raffle');
  if (!auth.user) return spinReply({ success: false, error: auth.error }, auth.status);
  try {
    const { data, error } = await createServerClient().from('spin_wheels')
      .select(`${SPIN_WHEEL_COLUMNS},spin_wheel_segments(count),spin_wheel_results(count)`).order('created_at', { ascending: false });
    // Before the Spin the Wheel migration is applied there are simply no wheels.
    if (error) return spinReply({ success: true, available: false, wheels: [] });
    return spinReply({ success: true, available: true, wheels: data || [] });
  } catch {
    return spinReply({ success: false, error: 'Wheels could not be loaded.' }, 503);
  }
}

/** Create a wheel, or update one when body.id is set (wheel and full segment list). */
export async function POST(request: Request) {
  const auth = await requirePermissionResult('raffle');
  if (!auth.user) return spinReply({ success: false, error: auth.error }, auth.status);
  const body = await readLimitedJsonObject(request, 64 * 1024);
  if (!body.ok) return spinReply({ success: false, error: body.error }, 400);
  const input = normaliseSpinWheelInput(body.value);
  if (!input) return spinReply({ success: false, error: 'Invalid wheel.' }, 400);
  if (input.id && !UUID_PATTERN.test(input.id)) return spinReply({ success: false, error: 'Invalid wheel.' }, 400);
  if (input.segments.some(segment => segment.id && !UUID_PATTERN.test(segment.id))) return spinReply({ success: false, error: 'Invalid segment.' }, 400);
  const errors = validateSpinWheel(input);
  if (errors.length) return spinReply({ success: false, errors }, 400);
  try {
    const db = createServerClient();
    if (input.status === 'live') {
      let others = db.from('spin_wheels').select('id,name').eq('status', 'live');
      if (input.id) others = others.neq('id', input.id);
      const { data: live, error: liveError } = await others.limit(1);
      if (liveError) return spinReply({ success: false, error: 'Live wheels could not be checked. Nothing was saved.' }, 503);
      if (live?.length) return spinReply({ success: false, errors: [`Only one wheel can be live at a time. Pause or end "${live[0].name}" first.`] }, 409);
    }
    if (input.id) {
      const current = await loadSpinWheel(db, input.id);
      if (!current) return spinReply({ success: false, error: 'That wheel no longer exists. Reload the page.' }, 404);
      // Taking a live wheel off live (or closing it within the checkout window)
      // strands paid spins and in-progress card checkouts: say so first.
      if (closesSpinWheel(current, input) && body.value.confirm_close !== true) {
        const since = new Date(Date.now() - SPIN_CHECKOUT_CLOSE_MINUTES * 60_000).toISOString();
        const [pending, unused] = await Promise.all([
          db.from('spin_wheel_orders').select('id', { count: 'exact', head: true }).eq('wheel_id', input.id).is('paid_at', null).gte('created_at', since),
          db.from('spin_wheel_entitlements').select('id', { count: 'exact', head: true }).eq('wheel_id', input.id).eq('source', 'purchase').is('used_at', null).is('revoked_at', null),
        ]);
        if (pending.error || unused.error) return spinReply({ success: false, error: 'Paid spins could not be checked. Nothing was saved.' }, 503);
        const pendingCheckouts = pending.count || 0;
        const unusedPaidSpins = unused.count || 0;
        if (pendingCheckouts > 0 || unusedPaidSpins > 0) {
          return spinReply({
            success: false, needsConfirmation: true, pendingCheckouts, unusedPaidSpins,
            error: `This stops spins while ${unusedPaidSpins} paid ${unusedPaidSpins === 1 ? 'spin is' : 'spins are'} unused and ${pendingCheckouts} card ${pendingCheckouts === 1 ? 'checkout is' : 'checkouts are'} in progress. Those buyers may need refunds from Orders.`,
          }, 409);
        }
      }
    }
    const { data, error } = await db.rpc('save_spin_wheel', { payload: saveSpinWheelPayload(input, input.id || null), actor_id: auth.user.id });
    if (error || !data) return spinReply({ success: false, error: spinAdminDatabaseMessage(error?.message, 'The wheel could not be saved.') }, 409);
    scheduleAdminAudit({ actor: auth.user, action: input.id ? 'update' : 'create', resource: 'spin_wheels', recordId: String(data), summary: `${input.name} (${input.status}, ${input.segments.length} segments)` });
    revalidatePublicContent();
    return spinReply({ success: true, id: data });
  } catch {
    return spinReply({ success: false, error: 'The wheel could not be saved.' }, 503);
  }
}
