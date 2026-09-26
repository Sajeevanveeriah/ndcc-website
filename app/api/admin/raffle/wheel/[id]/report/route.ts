import { NextResponse } from 'next/server';
import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { adminReply, loadWheelAdminDetail, UUID_PATTERN } from '@/lib/prize-wheel/admin';
import { raffleReportFilename, wheelReportCsv, wheelReportSummary, type RaffleReportOrder } from '@/lib/raffle-report';

export const dynamic = 'force-dynamic';

const ORDER_COLUMNS = 'id,campaign_id,payment_reference,customer_name,customer_email,customer_phone,quantity,amount_cents,status,payment_method,created_at,paid_at,cash_received_at,cash_received_by_member,cash_handed_in_at,customer_email_sent_at,member:club_members!cash_received_by_member(full_name),staff:committee_users!cash_received_by(full_name),raffle_tickets(ticket_number,ticket_reference),receipt_delivery_jobs(status)';

// Summary (JSON) or full CSV export (?format=csv) including every draw.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionResult('raffle');
  if (!auth.user) return adminReply({ success: false, error: auth.error }, auth.status);
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return adminReply({ success: false, error: 'Invalid campaign.' }, 400);
  try {
    const db = createServerClient();
    const [detail, orders] = await Promise.all([
      loadWheelAdminDetail(db, id),
      db.from('raffle_orders').select(ORDER_COLUMNS).eq('campaign_id', id).order('created_at').order('id'),
    ]);
    if (!detail || orders.error) return adminReply({ success: false, error: 'The prize wheel report could not be loaded.' }, 503);
    const rows = (orders.data || []) as unknown as RaffleReportOrder[];
    if (new URL(request.url).searchParams.get('format') !== 'csv') {
      return adminReply({ success: true, summary: wheelReportSummary(rows, detail.prizes) });
    }
    const csv = wheelReportCsv({
      campaignName: detail.campaign.name, campaignCode: detail.campaign.code, orders: rows, prizes: detail.prizes,
      draws: detail.draws, tickets: detail.tickets, collections: detail.collections, operators: detail.operators,
    });
    return new NextResponse(csv, { headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${raffleReportFilename(detail.campaign.code).replace('-Sales-', '-Wheel-')}"`,
      'Cache-Control': 'private, no-store',
    } });
  } catch {
    return adminReply({ success: false, error: 'The prize wheel report could not be loaded.' }, 503);
  }
}
