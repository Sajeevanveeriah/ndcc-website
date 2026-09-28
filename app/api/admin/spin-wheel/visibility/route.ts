import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { revalidatePublicContent } from '@/lib/server/revalidate-public';
import { scheduleAdminAudit } from '@/lib/revisions/server';
import { spinReply } from '@/lib/spin-wheel/server';
import { isMissingSchemaError } from '@/lib/supabase-schema-errors';
import { revalidateTag } from 'next/cache';
import { SPIN_SWITCH_CACHE_TAG } from '@/lib/spin-wheel/visibility';

export const dynamic = 'force-dynamic';

// CMS show/hide switch for Spin the Wheel (club_settings.spin_wheel_enabled).
// Only the flag changes: wheels, segments, prizes, passes, orders and results
// are never touched, so showing the feature again restores it as configured.

export async function GET() {
  const auth = await requirePermissionResult('raffle');
  if (!auth.user) return spinReply({ success: false, error: auth.error }, auth.status);
  try {
    const { data, error } = await createServerClient().from('club_settings').select('spin_wheel_enabled').eq('id', 'default').maybeSingle();
    if (error && isMissingSchemaError(error)) return spinReply({ success: true, available: false, enabled: true });
    if (error) return spinReply({ success: false, error: 'The Spin the Wheel setting could not be loaded.' }, 503);
    return spinReply({ success: true, available: true, enabled: (data as { spin_wheel_enabled?: unknown } | null)?.spin_wheel_enabled !== false });
  } catch {
    return spinReply({ success: false, error: 'The Spin the Wheel setting could not be loaded.' }, 503);
  }
}

export async function POST(request: Request) {
  const auth = await requirePermissionResult('raffle');
  if (!auth.user) return spinReply({ success: false, error: auth.error }, auth.status);
  const body = await readLimitedJsonObject(request, 1024);
  if (!body.ok) return spinReply({ success: false, error: body.error }, 400);
  const enabled = body.value.enabled;
  if (typeof enabled !== 'boolean') return spinReply({ success: false, error: 'Choose show or hide.' }, 400);
  try {
    const db = createServerClient();
    // Hiding stops spins and spin payments, like taking a wheel off live: a
    // buyer mid-checkout or holding unused paid spins may need a refund, so
    // say so first (same impact check as closing a wheel).
    if (!enabled && body.value.confirm_close !== true) {
      const { data: wheels, error: wheelsError } = await db.from('spin_wheels').select('id').in('status', ['live', 'paused']);
      if (wheelsError && !isMissingSchemaError(wheelsError)) return spinReply({ success: false, error: 'Paid spins could not be checked. Nothing was saved.' }, 503);
      let pendingCheckouts = 0;
      let unusedPaidSpins = 0;
      for (const wheel of (wheels || []) as Array<{ id: string }>) {
        const { data: impact, error: impactError } = await db.rpc('spin_wheel_close_impact', { target_wheel: wheel.id });
        const row = (Array.isArray(impact) ? impact[0] : impact) as { active_checkouts: number; unused_paid_spins: number } | null;
        if (impactError || !row) return spinReply({ success: false, error: 'Paid spins could not be checked. Nothing was saved.' }, 503);
        pendingCheckouts += Number(row.active_checkouts) || 0;
        unusedPaidSpins += Number(row.unused_paid_spins) || 0;
      }
      if (pendingCheckouts > 0 || unusedPaidSpins > 0) {
        return spinReply({
          success: false, needsConfirmation: true, pendingCheckouts, unusedPaidSpins,
          error: `Hiding stops spins while ${unusedPaidSpins} paid ${unusedPaidSpins === 1 ? 'spin is' : 'spins are'} unused and ${pendingCheckouts} card ${pendingCheckouts === 1 ? 'checkout is' : 'checkouts are'} in progress. Paid spins stay valid and can be used when the feature is shown again; buyers who want their money back may need refunds from Orders.`,
        }, 409);
      }
    }
    const { data, error } = await db.from('club_settings')
      .update({ spin_wheel_enabled: enabled }).eq('id', 'default').select('spin_wheel_enabled').maybeSingle();
    if (error && isMissingSchemaError(error)) return spinReply({ success: false, error: 'Apply the Spin the Wheel show/hide migration first. Nothing was saved.' }, 409);
    if (error || !data) return spinReply({ success: false, error: 'The setting could not be saved.' }, 503);
    scheduleAdminAudit({ actor: auth.user, action: 'update', resource: 'club_settings', recordId: 'default', summary: `Spin the Wheel ${enabled ? 'shown on' : 'hidden from'} the website` });
    revalidateTag(SPIN_SWITCH_CACHE_TAG);
    revalidatePublicContent('clubSettings');
    return spinReply({ success: true, enabled: (data as { spin_wheel_enabled?: unknown }).spin_wheel_enabled !== false });
  } catch {
    return spinReply({ success: false, error: 'The setting could not be saved.' }, 503);
  }
}
