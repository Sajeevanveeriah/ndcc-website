import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { enforceRateLimit } from '@/lib/server/request-guards';
import { adminReply, loadWheelCampaign, UUID_PATTERN, wheelDatabaseMessage } from '@/lib/prize-wheel/admin';
import { drawWinningNumber } from '@/lib/prize-wheel/random';

export const dynamic = 'force-dynamic';

/**
 * Picks the winning number with node:crypto and stores the draw row FIRST.
 * The draw screen animates the wheel to the stored number afterwards; the
 * animation is presentation only.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionResult('raffle');
  if (!auth.user) return adminReply({ success: false, error: auth.error }, auth.status);
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return adminReply({ success: false, error: 'Invalid campaign.' }, 400);
  if (!await enforceRateLimit(`wheel-draw:${auth.user.id}`, 30, 60_000)) return adminReply({ success: false, error: 'Please wait a moment before the next spin.' }, 429);
  const body = await readLimitedJsonObject(request, 4 * 1024);
  if (!body.ok) return adminReply({ success: false, error: body.error }, 400);
  const prizeId = body.value.prizeId;
  const respin = body.value.respin ?? null;
  if (typeof prizeId !== 'string' || !UUID_PATTERN.test(prizeId) || ![null, 'no_winner', 'unclaimed'].includes(respin as string | null)) {
    return adminReply({ success: false, error: 'Choose a prize to draw.' }, 400);
  }
  try {
    const db = createServerClient();
    const campaign = await loadWheelCampaign(db, id);
    if (!campaign) return adminReply({ success: false, error: 'Prize wheel campaign not found.' }, 404);
    const { winningNumber, randomValue } = drawWinningNumber(campaign.wheel_divisions);
    const { data, error } = await db.rpc('record_wheel_draw', {
      target_campaign: campaign.id, target_prize: prizeId, drawn_number: winningNumber,
      random_source: randomValue, actor_id: auth.user.id, respin,
    });
    if (error || !data) return adminReply({ success: false, error: wheelDatabaseMessage(error?.message, 'The draw could not be recorded. Nothing was drawn.') }, 409);
    return adminReply({ success: true, draw: data });
  } catch {
    return adminReply({ success: false, error: 'The draw could not be recorded. Nothing was drawn.' }, 500);
  }
}
