import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { adminReply, loadWheelAdminDetail, UUID_PATTERN } from '@/lib/prize-wheel/admin';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionResult('raffle');
  if (!auth.user) return adminReply({ success: false, error: auth.error }, auth.status);
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return adminReply({ success: false, error: 'Invalid campaign.' }, 400);
  try {
    const detail = await loadWheelAdminDetail(createServerClient(), id);
    if (!detail) return adminReply({ success: false, error: 'Prize wheel campaign not found or temporarily unavailable.' }, 404);
    return adminReply({ success: true, ...detail, serverTime: new Date().toISOString() });
  } catch {
    return adminReply({ success: false, error: 'Prize wheel campaign could not be loaded.' }, 503);
  }
}
