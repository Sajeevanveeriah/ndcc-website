import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { adminReply, UUID_PATTERN, wheelDatabaseMessage } from '@/lib/prize-wheel/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionResult('raffle');
  if (!auth.user) return adminReply({ success: false, error: auth.error }, auth.status);
  const { id } = await params;
  const body = await readLimitedJsonObject(request, 4 * 1024);
  if (!body.ok) return adminReply({ success: false, error: body.error }, 400);
  const drawId = body.value.drawId;
  const note = typeof body.value.note === 'string' ? body.value.note.trim().slice(0, 300) : '';
  if (!UUID_PATTERN.test(id) || typeof drawId !== 'string' || !UUID_PATTERN.test(drawId)) return adminReply({ success: false, error: 'Invalid draw.' }, 400);
  try {
    const db = createServerClient();
    const owner = await db.from('raffle_draws').select('id').eq('id', drawId).eq('campaign_id', id).maybeSingle();
    if (owner.error || !owner.data) return adminReply({ success: false, error: 'Draw not found.' }, 404);
    const { data, error } = await db.rpc('record_wheel_prize_collection', { target_draw: drawId, actor_id: auth.user.id, collection_note: note || null });
    if (error) return adminReply({ success: false, error: wheelDatabaseMessage(error.message, 'Collection could not be recorded.') }, 409);
    return adminReply({ success: true, recorded: data === true });
  } catch {
    return adminReply({ success: false, error: 'Collection could not be recorded.' }, 500);
  }
}
