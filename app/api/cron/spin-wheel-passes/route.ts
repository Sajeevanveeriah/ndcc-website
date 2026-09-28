import { NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { createServerClient } from '@/lib/supabase-server';
import { parseSpinCursor, spinCursorOf, spinKeysetFilter, type SpinCursor } from '@/lib/spin-wheel/admin';
import { sendSpinOrderPassEmail, sendSpinWinnerEmail } from '@/lib/spin-wheel/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };
const WORK_BUDGET_MS = 45_000;
const PAGE_SIZE = 200;
const LOOKBACK_MS = 60 * 24 * 60 * 60_000;

type OrderRow = { id: string; order_id: string; pass_id: string | null };
type WinnerRow = { id: string; created_at: string; spinner_email: string; spinner_name: string | null; wheel: { name: string; claim_instructions: string | null } | { name: string; claim_instructions: string | null }[] | null };

/**
 * Daily safety net for Spin the Wheel over the last 60 days: re-syncs spins
 * for orders whose payment status and spins disagree, emails any guest spin
 * link not yet sent, and retries winner emails that failed. Only outstanding
 * work is queried, so progress never depends on where a previous run
 * stopped. Link tokens are re-derived from the pass id, so nothing secret is
 * stored for this.
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

    // Only orders that still need work are returned, so finished rows drop
    // out. Rows already tried this run are excluded in the query, so a batch
    // of repeated failures cannot stop the run reaching newer orders.
    const attempted = new Set<string>();
    while (Date.now() <= deadline) {
      const { data, error } = await db.rpc('spin_wheel_orders_needing_work', { since, max_rows: PAGE_SIZE, skip_ids: [...attempted] });
      if (error) {
        // Before the migration is applied there is nothing to do.
        return NextResponse.json({ success: true, ...totals, skipped: true }, { headers: NO_STORE });
      }
      const rows = (data || []) as OrderRow[];
      if (!rows.length) break;
      for (const order of rows) {
        if (Date.now() > deadline) { totals.complete = false; break; }
        attempted.add(order.id);
        const sync = await db.rpc('sync_spin_wheel_order_entitlements', { target_order: order.order_id });
        if (!sync.error) totals.synced += 1;
        if (order.pass_id && await sendSpinOrderPassEmail(db, order.id)) totals.linksEmailed += 1;
      }
    }
    if (Date.now() > deadline) totals.complete = false;

    // Winner emails that failed at spin time, oldest first. Paging from the
    // last row seen (created_at, id) is unaffected by sent rows dropping out.
    let cursor: SpinCursor | null = null;
    for (;;) {
      if (Date.now() > deadline) { totals.complete = false; break; }
      let query = db.from('spin_wheel_results')
        .select('id,created_at,spinner_email,spinner_name,wheel:spin_wheels(name,claim_instructions)')
        .eq('is_prize', true).is('voided_at', null).is('winner_emailed_at', null).not('spinner_email', 'is', null)
        .gte('created_at', since);
      if (cursor) query = query.or(spinKeysetFilter(cursor, 'asc'));
      const { data, error } = await query.order('created_at', { ascending: true }).order('id', { ascending: true }).limit(PAGE_SIZE);
      if (error) break;
      const rows = (data || []) as WinnerRow[];
      for (const row of rows) {
        if (Date.now() > deadline) { totals.complete = false; break; }
        const wheel = Array.isArray(row.wheel) ? row.wheel[0] : row.wheel;
        if (wheel && await sendSpinWinnerEmail(db, row.id, { email: row.spinner_email, name: row.spinner_name }, wheel)) totals.winnersEmailed += 1;
      }
      if (rows.length < PAGE_SIZE || !totals.complete) break;
      cursor = parseSpinCursor(spinCursorOf(rows[rows.length - 1]));
    }
    return NextResponse.json({ success: true, ...totals }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ success: false, error: 'Spin the Wheel sync failed.' }, { status: 500, headers: NO_STORE });
  }
}
