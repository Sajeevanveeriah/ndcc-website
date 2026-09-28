import { NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { createServerClient } from '@/lib/supabase-server';
import { sendSpinOrderPassEmail } from '@/lib/spin-wheel/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };
const WORK_BUDGET_MS = 45_000;

/**
 * Daily safety net for Spin the Wheel: re-syncs spins from each recent spin
 * order's payment status, and emails any guest spin link that has not been
 * sent (for example after a failed email). The link token is re-derived from
 * the pass id, so nothing secret is stored for this.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401, headers: NO_STORE });
  }
  try {
    const db = createServerClient({ fetchTimeoutMs: null });
    const since = new Date(Date.now() - 60 * 24 * 60 * 60_000).toISOString();
    const { data, error } = await db.from('spin_wheel_orders').select('id,order_id,pass_id,pass_emailed_at')
      .gte('created_at', since).order('created_at', { ascending: true }).limit(500);
    if (error) {
      // Before the migration is applied there is nothing to do.
      return NextResponse.json({ success: true, synced: 0, emailed: 0, skipped: true }, { headers: NO_STORE });
    }
    const deadline = Date.now() + WORK_BUDGET_MS;
    let synced = 0;
    let emailed = 0;
    for (const order of data || []) {
      if (Date.now() > deadline) break;
      const sync = await db.rpc('sync_spin_wheel_order_entitlements', { target_order: order.order_id });
      if (!sync.error) synced += 1;
      if (order.pass_id && !order.pass_emailed_at && await sendSpinOrderPassEmail(db, order.id)) emailed += 1;
    }
    return NextResponse.json({ success: true, synced, emailed }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ success: false, error: 'Spin the Wheel sync failed.' }, { status: 500, headers: NO_STORE });
  }
}
