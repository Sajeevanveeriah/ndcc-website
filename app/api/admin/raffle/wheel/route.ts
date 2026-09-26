import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { revalidatePublicContent } from '@/lib/server/revalidate-public';
import { adminReply, UUID_PATTERN, wheelDatabaseMessage } from '@/lib/prize-wheel/admin';
import { WHEEL_CAMPAIGN_COLUMNS } from '@/lib/prize-wheel/server';
import { normaliseWheelCampaignInput, validateWheelCampaign, type WheelDayCampaign } from '@/lib/prize-wheel/rules';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requirePermissionResult('raffle');
  if (!auth.user) return adminReply({ success: false, error: auth.error }, auth.status);
  try {
    const db = createServerClient();
    const { data, error } = await db.from('raffle_campaigns').select(`${WHEEL_CAMPAIGN_COLUMNS},raffle_wheel_prizes(id,position,name,description,retail_value_cents,quantity)`)
      .eq('kind', 'wheel').order('draw_at', { ascending: false });
    // Before the prize wheel migration is applied there are simply no wheel campaigns.
    if (error) return adminReply({ success: true, available: false, campaigns: [] });
    return adminReply({ success: true, available: true, campaigns: data || [], canEdit: auth.user.role === 'admin' });
  } catch {
    return adminReply({ success: false, error: 'Prize wheel campaigns could not be loaded.' }, 503);
  }
}

export async function POST(request: Request) {
  const auth = await requirePermissionResult('raffle');
  if (!auth.user) return adminReply({ success: false, error: auth.error }, auth.status);
  // Mirrors raffle campaign editing, which is limited to administrators.
  if (auth.user.role !== 'admin') return adminReply({ success: false, error: 'Only administrators can create or edit prize wheel campaigns.' }, 403);
  const body = await readLimitedJsonObject(request, 32 * 1024);
  if (!body.ok) return adminReply({ success: false, error: body.error }, 400);
  const input = normaliseWheelCampaignInput(body.value);
  if (!input) return adminReply({ success: false, error: 'Invalid prize wheel campaign.' }, 400);
  const id = typeof body.value.id === 'string' && body.value.id ? body.value.id : null;
  if (id && !UUID_PATTERN.test(id)) return adminReply({ success: false, error: 'Invalid campaign.' }, 400);
  if (body.value.no_cash_prizes_confirmed !== true) {
    return adminReply({ success: false, errors: ['Confirm that no prize is cash, a debit card or a cash equivalent.'] }, 400);
  }
  try {
    const db = createServerClient();
    const others = await db.from('raffle_campaigns').select('id,draw_at,prize_pool_cents,active').eq('kind', 'wheel');
    if (others.error) return adminReply({ success: false, error: 'The prize wheel database update has not been applied yet.' }, 503);
    const errors = validateWheelCampaign(input, (others.data || []) as WheelDayCampaign[], id);
    if (errors.length) return adminReply({ success: false, errors }, 400);
    const { data, error } = await db.rpc('save_wheel_campaign', { payload: { ...input, id }, actor_id: auth.user.id });
    if (error) return adminReply({ success: false, error: wheelDatabaseMessage(error.message, 'The prize wheel campaign could not be saved.') }, 409);
    revalidatePublicContent('raffleCampaigns');
    return adminReply({ success: true, id: data });
  } catch {
    return adminReply({ success: false, error: 'The prize wheel campaign could not be saved.' }, 500);
  }
}
