import { NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { createServerClient } from '@/lib/supabase-server';
import { sendSpinOrderPassEmail, sendSpinWinnerEmail } from '@/lib/spin-wheel/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };
const WORK_BUDGET_MS = 45_000;
const PAGE_SIZE = 200;
const LOOKBACK_MS = 60 * 24 * 60 * 60_000;

type OrderRow = { id: string; order_id: string; pass_id: string | null; pass_emailed_at: string | null };
type WinnerRow = { id: string; spinner_email: string; spinner_name: string | null; wheel: { name: string; claim_instructions: string | null } | { name: string; claim_instructions: string | null }[] | null };

/**
 * Daily safety net for Spin the Wheel, paged through every recent row:
 * re-syncs spins from each spin order's payment status, emails any guest spin
 * link not yet sent, and retries winner emails that failed. Link tokens are
 * re-derived from the pass id, so nothing secret is stored for this.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401, headers: NO_STORE });
  }
  try {
    const db = createServerClient({ fetchTimeoutMs: null });
    const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
    const deadline = Date.now() + WORK_BUDGET_MS;
    const totals = { synced: 0, linksEmailed: 0, winnersEmailed: 0, complete: true };

    // Stable order (created_at, id) so offsets page through each row once.
    for (let offset = 0; ; offset += PAGE_SIZE) {
      if (Date.now() > deadline) { totals.complete = false; break; }
      const { data, error } = await db.from('spin_wheel_orders').select('id,order_id,pass_id,pass_emailed_at')
        .gte('created_at', since).order('created_at', { ascending: true }).order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) {
        // Before the migration is applied there is nothing to do.
        return NextResponse.json({ success: true, ...totals, skipped: true }, { headers: NO_STORE });
      }
      const rows = (data || []) as OrderRow[];
      for (const order of rows) {
        if (Date.now() > deadline) { totals.complete = false; break; }
        const sync = await db.rpc('sync_spin_wheel_order_entitlements', { target_order: order.order_id });
        if (!sync.error) totals.synced += 1;
        if (order.pass_id && !order.pass_emailed_at && await sendSpinOrderPassEmail(db, order.id)) totals.linksEmailed += 1;
      }
      if (rows.length < PAGE_SIZE) break;
    }

    // Winner emails that failed at spin time. Only unsent rows are selected,
    // so each page shrinks as emails succeed; a failed row keeps its place.
    for (let offset = 0; ; offset += PAGE_SIZE) {
      if (Date.now() > deadline) { totals.complete = false; break; }
      const { data, error } = await db.from('spin_wheel_results')
        .select('id,spinner_email,spinner_name,wheel:spin_wheels(name,claim_instructions)')
        .eq('is_prize', true).is('voided_at', null).is('winner_emailed_at', null).not('spinner_email', 'is', null)
        .gte('created_at', since).order('created_at', { ascending: true }).order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) break;
      const rows = (data || []) as WinnerRow[];
      let sent = 0;
      for (const row of rows) {
        if (Date.now() > deadline) { totals.complete = false; break; }
        const wheel = Array.isArray(row.wheel) ? row.wheel[0] : row.wheel;
        if (!wheel) continue;
        if (await sendSpinWinnerEmail(db, row.id, { email: row.spinner_email, name: row.spinner_name }, wheel)) { sent += 1; totals.winnersEmailed += 1; }
      }
      if (rows.length < PAGE_SIZE) break;
      // Sent rows drop out of the filter, so step past only the ones that stayed.
      offset -= sent;
    }
    return NextResponse.json({ success: true, ...totals }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ success: false, error: 'Spin the Wheel sync failed.' }, { status: 500, headers: NO_STORE });
  }
}
