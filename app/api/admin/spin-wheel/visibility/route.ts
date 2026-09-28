import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { revalidatePublicContent } from '@/lib/server/revalidate-public';
import { scheduleAdminAudit } from '@/lib/revisions/server';
import { spinReply } from '@/lib/spin-wheel/server';
import { isMissingSchemaError } from '@/lib/supabase-schema-errors';

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
    const { data, error } = await createServerClient().from('club_settings')
      .update({ spin_wheel_enabled: enabled }).eq('id', 'default').select('spin_wheel_enabled').maybeSingle();
    if (error && isMissingSchemaError(error)) return spinReply({ success: false, error: 'Apply the Spin the Wheel show/hide migration first. Nothing was saved.' }, 409);
    if (error || !data) return spinReply({ success: false, error: 'The setting could not be saved.' }, 503);
    scheduleAdminAudit({ actor: auth.user, action: 'update', resource: 'club_settings', recordId: 'default', summary: `Spin the Wheel ${enabled ? 'shown on' : 'hidden from'} the website` });
    revalidatePublicContent('clubSettings');
    return spinReply({ success: true, enabled: (data as { spin_wheel_enabled?: unknown }).spin_wheel_enabled !== false });
  } catch {
    return spinReply({ success: false, error: 'The setting could not be saved.' }, 503);
  }
}
